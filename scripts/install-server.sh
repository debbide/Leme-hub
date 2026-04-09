#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[32m'
RESET='\033[0m'

SERVICE_NAME='leme-hub-server'
APP_USER='lemehub'
APP_GROUP='lemehub'
INSTALL_DIR='/opt/leme-hub-server'
BINARY_PATH="${INSTALL_DIR}/leme-hub-server"
RUNTIME_DIR='/var/lib/leme-hub-server'
SETTINGS_FILE="${RUNTIME_DIR}/data/settings.json"
ENV_FILE="/etc/default/${SERVICE_NAME}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
DEFAULT_DOWNLOAD_URL="${LEME_DOWNLOAD_URL:-https://github.com/debbide/Leme-hub/releases/download/v2.3.6/leme-hub-server-linux-amd64}"
DEFAULT_HOST='0.0.0.0'
DEFAULT_PORT='51888'
DEFAULT_PROXY_HOST='127.0.0.1'
DEFAULT_PROXY_HTTP_PORT='18999'
DEFAULT_PROXY_SOCKS_PORT='18998'
DEFAULT_PROXY_ENABLED='false'

say() {
  printf '%b%s%b\n' "${GREEN}" "$1" "${RESET}"
}

prompt() {
  printf '%b%s%b' "${GREEN}" "$1" "${RESET}"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    say '请使用 root 或 sudo 运行此脚本。'
    exit 1
  fi
}

require_systemd() {
  if ! command -v systemctl >/dev/null 2>&1; then
    say '当前系统未检测到 systemd，暂不支持自动安装服务。'
    exit 1
  fi
}

require_python3() {
  if ! command -v python3 >/dev/null 2>&1; then
    say '当前系统未检测到 python3，无法写入代理设置文件。'
    exit 1
  fi
}

read_env_value() {
  local key="$1"
  if [[ -f "${ENV_FILE}" ]]; then
    awk -F= -v key="${key}" '$1 == key { print substr($0, index($0, "=") + 1) }' "${ENV_FILE}" | tail -n 1
  fi
}

read_settings_value() {
  local key="$1"
  if [[ ! -f "${SETTINGS_FILE}" ]]; then
    return
  fi

  python3 - "${SETTINGS_FILE}" "${key}" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
key = sys.argv[2]

try:
    data = json.loads(path.read_text(encoding='utf-8'))
except Exception:
    sys.exit(0)

if not isinstance(data, dict):
    sys.exit(0)

value = data.get(key)
if isinstance(value, bool):
    print('true' if value else 'false')
elif value is None:
    sys.exit(0)
else:
    print(value)
PY
}

ensure_service_user() {
  local nologin_shell
  nologin_shell="$(command -v nologin || true)"
  nologin_shell="${nologin_shell:-/usr/sbin/nologin}"

  if ! getent group "${APP_GROUP}" >/dev/null 2>&1; then
    groupadd --system "${APP_GROUP}"
  fi

  if ! id "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --gid "${APP_GROUP}" --home "${RUNTIME_DIR}" --create-home --shell "${nologin_shell}" "${APP_USER}"
  fi
}

download_binary() {
  local url="$1"
  local tmp_file
  tmp_file="$(mktemp)"

  say "开始下载服务端文件：${url}"

  if command -v curl >/dev/null 2>&1; then
    curl -fL "${url}" -o "${tmp_file}"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "${tmp_file}" "${url}"
  else
    rm -f "${tmp_file}"
    say '系统未找到 curl 或 wget，请先安装其中一个再执行脚本。'
    exit 1
  fi

  install -Dm755 "${tmp_file}" "${BINARY_PATH}"
  rm -f "${tmp_file}"
}

write_settings_file() {
  local proxy_host="$1"
  local proxy_http_port="$2"
  local proxy_socks_port="$3"
  local proxy_enabled="$4"

  mkdir -p "$(dirname "${SETTINGS_FILE}")"

  python3 - "${SETTINGS_FILE}" "${proxy_host}" "${proxy_http_port}" "${proxy_socks_port}" "${proxy_enabled}" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
proxy_host = sys.argv[2]
proxy_http_port = int(sys.argv[3])
proxy_socks_port = int(sys.argv[4])
proxy_enabled = sys.argv[5].lower() in {'1', 'true', 'yes', 'y'}

if path.exists():
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}
else:
    data = {}

data['proxyListenHost'] = proxy_host
data['systemProxyHttpPort'] = proxy_http_port
data['systemProxySocksPort'] = proxy_socks_port
data['systemProxyEnabled'] = proxy_enabled
data['systemProxyCaptureEnabled'] = False

path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
}

write_env_file() {
  local host="$1"
  local port="$2"

  cat > "${ENV_FILE}" <<EOF
LEME_MODE=server
LEME_UI_HOST=${host}
LEME_UI_PORT=${port}
LEME_RUNTIME_ROOT=${RUNTIME_DIR}
EOF
}

write_service_file() {
  cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Leme Hub Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${BINARY_PATH}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

prompt_download_url() {
  local current_url
  current_url="${DEFAULT_DOWNLOAD_URL}"
  prompt "请输入下载链接 [${current_url}]: "
  read -r DOWNLOAD_URL
  DOWNLOAD_URL="${DOWNLOAD_URL:-${current_url}}"
}

prompt_host() {
  local current_host
  local default_choice
  current_host="$(read_env_value 'LEME_UI_HOST')"
  current_host="${current_host:-${DEFAULT_HOST}}"

  case "${current_host}" in
    0.0.0.0)
      default_choice='1'
      ;;
    127.0.0.1)
      default_choice='2'
      ;;
    *)
      default_choice='3'
      ;;
  esac

  say '请选择监听地址：'
  say '1. 监听全部地址（0.0.0.0）'
  say '2. 仅监听本机（127.0.0.1）'
  say "3. 自定义地址（当前：${current_host}）"

  while true; do
    prompt "请输入选项 [${default_choice}]: "
    read -r host_choice
    host_choice="${host_choice:-${default_choice}}"

    case "${host_choice}" in
      1)
        LISTEN_HOST='0.0.0.0'
        return
        ;;
      2)
        LISTEN_HOST='127.0.0.1'
        return
        ;;
      3)
        prompt "请输入自定义监听地址 [${current_host}]: "
        read -r custom_host
        custom_host="${custom_host:-${current_host}}"
        if [[ -n "${custom_host}" ]]; then
          LISTEN_HOST="${custom_host}"
          return
        fi
        say '监听地址不能为空。'
        ;;
      *)
        say '请输入 1、2 或 3。'
        ;;
    esac
  done
}

prompt_port() {
  local current_port
  current_port="$(read_env_value 'LEME_UI_PORT')"
  current_port="${current_port:-${DEFAULT_PORT}}"

  while true; do
    prompt "请输入监听端口 [${current_port}]: "
    read -r input_port
    input_port="${input_port:-${current_port}}"

    if [[ "${input_port}" =~ ^[0-9]+$ ]] && (( input_port >= 1 && input_port <= 65535 )); then
      LISTEN_PORT="${input_port}"
      return
    fi

    say '端口必须是 1 到 65535 之间的数字。'
  done
}

prompt_proxy_enabled() {
  local current_enabled
  local default_choice
  current_enabled="$(read_settings_value 'systemProxyEnabled')"
  current_enabled="${current_enabled:-${DEFAULT_PROXY_ENABLED}}"

  if [[ "${current_enabled}" == 'true' ]]; then
    default_choice='Y'
  else
    default_choice='N'
  fi

  while true; do
    prompt "是否启用统一代理入口（Docker / 局域网通常选是）? [${default_choice}]: "
    read -r proxy_enabled_choice
    proxy_enabled_choice="${proxy_enabled_choice:-${default_choice}}"

    case "${proxy_enabled_choice}" in
      Y|y)
        PROXY_ENABLED='true'
        return
        ;;
      N|n)
        PROXY_ENABLED='false'
        return
        ;;
      *)
        say '请输入 Y 或 N。'
        ;;
    esac
  done
}

prompt_proxy_host() {
  local current_host
  local default_choice
  current_host="$(read_settings_value 'proxyListenHost')"
  current_host="${current_host:-${DEFAULT_PROXY_HOST}}"

  case "${current_host}" in
    0.0.0.0)
      default_choice='1'
      ;;
    127.0.0.1)
      default_choice='2'
      ;;
    *)
      default_choice='3'
      ;;
  esac

  say '请选择代理监听地址：'
  say '1. 监听全部地址（0.0.0.0）'
  say '2. 仅监听本机（127.0.0.1）'
  say "3. 自定义地址（当前：${current_host}）"

  while true; do
    prompt "请输入选项 [${default_choice}]: "
    read -r proxy_host_choice
    proxy_host_choice="${proxy_host_choice:-${default_choice}}"

    case "${proxy_host_choice}" in
      1)
        PROXY_HOST='0.0.0.0'
        return
        ;;
      2)
        PROXY_HOST='127.0.0.1'
        return
        ;;
      3)
        prompt "请输入自定义代理监听地址 [${current_host}]: "
        read -r custom_proxy_host
        custom_proxy_host="${custom_proxy_host:-${current_host}}"
        if [[ -n "${custom_proxy_host}" ]]; then
          PROXY_HOST="${custom_proxy_host}"
          return
        fi
        say '代理监听地址不能为空。'
        ;;
      *)
        say '请输入 1、2 或 3。'
        ;;
    esac
  done
}

prompt_proxy_port() {
  local key="$1"
  local default_port="$2"
  local label="$3"
  local current_port
  current_port="$(read_settings_value "${key}")"
  current_port="${current_port:-${default_port}}"

  while true; do
    prompt "请输入${label} [${current_port}]: "
    read -r input_port
    input_port="${input_port:-${current_port}}"

    if [[ "${input_port}" =~ ^[0-9]+$ ]] && (( input_port >= 1 && input_port <= 65535 )); then
      PROMPTED_PROXY_PORT="${input_port}"
      return
    fi

    say '端口必须是 1 到 65535 之间的数字。'
  done
}

install_server() {
  prompt_download_url
  prompt_host
  prompt_port
  require_python3
  prompt_proxy_enabled
  if [[ "${PROXY_ENABLED}" == 'true' ]]; then
    prompt_proxy_host
    prompt_proxy_port 'systemProxyHttpPort' "${DEFAULT_PROXY_HTTP_PORT}" 'HTTP 代理端口'
    PROXY_HTTP_PORT="${PROMPTED_PROXY_PORT}"
    while true; do
      prompt_proxy_port 'systemProxySocksPort' "${DEFAULT_PROXY_SOCKS_PORT}" 'SOCKS5 代理端口'
      PROXY_SOCKS_PORT="${PROMPTED_PROXY_PORT}"
      if [[ "${PROXY_SOCKS_PORT}" != "${PROXY_HTTP_PORT}" ]]; then
        break
      fi
      say 'HTTP 和 SOCKS5 代理端口不能相同。'
    done
  else
    PROXY_HOST="$(read_settings_value 'proxyListenHost')"
    PROXY_HOST="${PROXY_HOST:-${DEFAULT_PROXY_HOST}}"
    PROXY_HTTP_PORT="$(read_settings_value 'systemProxyHttpPort')"
    PROXY_HTTP_PORT="${PROXY_HTTP_PORT:-${DEFAULT_PROXY_HTTP_PORT}}"
    PROXY_SOCKS_PORT="$(read_settings_value 'systemProxySocksPort')"
    PROXY_SOCKS_PORT="${PROXY_SOCKS_PORT:-${DEFAULT_PROXY_SOCKS_PORT}}"
  fi

  ensure_service_user
  mkdir -p "${INSTALL_DIR}" "${RUNTIME_DIR}"

  if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    systemctl stop "${SERVICE_NAME}" >/dev/null 2>&1 || true
  fi

  download_binary "${DOWNLOAD_URL}"
  write_settings_file "${PROXY_HOST}" "${PROXY_HTTP_PORT}" "${PROXY_SOCKS_PORT}" "${PROXY_ENABLED}"
  write_env_file "${LISTEN_HOST}" "${LISTEN_PORT}"
  write_service_file

  chown -R "${APP_USER}:${APP_GROUP}" "${INSTALL_DIR}" "${RUNTIME_DIR}"
  chmod 755 "${INSTALL_DIR}" "${RUNTIME_DIR}"
  chmod 644 "${ENV_FILE}" "${SERVICE_FILE}"

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}"

  say '安装完成。'
  say "安装目录：${INSTALL_DIR}"
  say "数据目录：${RUNTIME_DIR}"
  say "控制面板监听地址：${LISTEN_HOST}"
  say "控制面板监听端口：${LISTEN_PORT}"
  if [[ "${PROXY_ENABLED}" == 'true' ]]; then
    say "代理监听地址：${PROXY_HOST}"
    say "HTTP 代理端口：${PROXY_HTTP_PORT}"
    say "SOCKS5 代理端口：${PROXY_SOCKS_PORT}"
  else
    say '统一代理入口：未启用'
  fi
  say '服务管理命令：'
  say "  启动：systemctl start ${SERVICE_NAME}"
  say "  停止：systemctl stop ${SERVICE_NAME}"
  say "  状态：systemctl status ${SERVICE_NAME}"
  if [[ "${LISTEN_HOST}" == '0.0.0.0' ]]; then
    say "浏览器访问：http://服务器IP:${LISTEN_PORT}"
  else
    say "浏览器访问：http://${LISTEN_HOST}:${LISTEN_PORT}"
  fi
  if [[ "${PROXY_ENABLED}" == 'true' ]]; then
    if [[ "${PROXY_HOST}" == '0.0.0.0' ]]; then
      say "HTTP 代理：服务器IP:${PROXY_HTTP_PORT}"
      say "SOCKS5 代理：服务器IP:${PROXY_SOCKS_PORT}"
    else
      say "HTTP 代理：${PROXY_HOST}:${PROXY_HTTP_PORT}"
      say "SOCKS5 代理：${PROXY_HOST}:${PROXY_SOCKS_PORT}"
    fi
  fi
}

uninstall_server() {
  local remove_data

  if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    systemctl disable --now "${SERVICE_NAME}" >/dev/null 2>&1 || true
  fi

  rm -f "${SERVICE_FILE}"
  rm -f "${ENV_FILE}"
  rm -rf "${INSTALL_DIR}"
  systemctl daemon-reload

  prompt "是否同时删除数据目录 ${RUNTIME_DIR} ? [y/N]: "
  read -r remove_data
  remove_data="${remove_data:-N}"
  if [[ "${remove_data}" =~ ^[Yy]$ ]]; then
    rm -rf "${RUNTIME_DIR}"
    userdel "${APP_USER}" >/dev/null 2>&1 || true
    say '服务、程序文件和数据目录都已删除。'
  else
    say "服务和程序文件已删除，数据目录已保留：${RUNTIME_DIR}"
  fi
}

show_menu() {
  say 'Leme Hub Server 交互式安装脚本'
  say '1. 安装 / 更新'
  say '2. 卸载'
  say '0. 退出'
}

main() {
  require_root
  require_systemd

  show_menu
  prompt '请选择操作 [1]: '
  read -r action
  action="${action:-1}"

  case "${action}" in
    1)
      install_server
      ;;
    2)
      uninstall_server
      ;;
    0)
      say '已退出。'
      ;;
    *)
      say '无效选项，请重新执行脚本。'
      exit 1
      ;;
  esac
}

main "$@"
