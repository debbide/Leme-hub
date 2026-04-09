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
ENV_FILE="/etc/default/${SERVICE_NAME}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
DEFAULT_DOWNLOAD_URL="${LEME_DOWNLOAD_URL:-https://github.com/debbide/Leme-hub/releases/download/v2.3.6/leme-hub-server-linux-amd64}"
DEFAULT_HOST='0.0.0.0'
DEFAULT_PORT='51888'

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

read_env_value() {
  local key="$1"
  if [[ -f "${ENV_FILE}" ]]; then
    awk -F= -v key="${key}" '$1 == key { print substr($0, index($0, "=") + 1) }' "${ENV_FILE}" | tail -n 1
  fi
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

install_server() {
  prompt_download_url
  prompt_host
  prompt_port

  ensure_service_user
  mkdir -p "${INSTALL_DIR}" "${RUNTIME_DIR}"

  if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    systemctl stop "${SERVICE_NAME}" >/dev/null 2>&1 || true
  fi

  download_binary "${DOWNLOAD_URL}"
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
  say "监听地址：${LISTEN_HOST}"
  say "监听端口：${LISTEN_PORT}"
  say '服务管理命令：'
  say "  启动：systemctl start ${SERVICE_NAME}"
  say "  停止：systemctl stop ${SERVICE_NAME}"
  say "  状态：systemctl status ${SERVICE_NAME}"
  if [[ "${LISTEN_HOST}" == '0.0.0.0' ]]; then
    say "浏览器访问：http://服务器IP:${LISTEN_PORT}"
  else
    say "浏览器访问：http://${LISTEN_HOST}:${LISTEN_PORT}"
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
