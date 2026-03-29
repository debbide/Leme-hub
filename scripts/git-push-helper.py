import subprocess
import sys
import os

# 配置默认代理
DEFAULT_PROXY = "http://127.0.0.1:20101"

def run_command(cmd, env=None):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return False
    print(result.stdout)
    return True

def main():
    if len(sys.argv) < 2:
        print("Usage: python git-push-helper.py \"your commit message\"")
        return

    msg = sys.argv[1]
    
    # Ensure we are in the project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, ".."))
    os.chdir(project_root)

    print(f"Working in: {project_root}")
    print(f"Using proxy: {DEFAULT_PROXY}")
    
    # 设置环境变量代理
    custom_env = os.environ.copy()
    custom_env["http_proxy"] = DEFAULT_PROXY
    custom_env["https_proxy"] = DEFAULT_PROXY
    
    # 强制让 git 记住这个设置 (针对当前仓库)
    run_command(f'git config http.proxy {DEFAULT_PROXY}', env=custom_env)
    run_command(f'git config https.proxy {DEFAULT_PROXY}', env=custom_env)
    
    if not run_command("git add -u", env=custom_env): return # Only add tracked files
    if not run_command(f'git commit -m "{msg}"', env=custom_env): return
    if not run_command("git push", env=custom_env): return
    
    print("Push successful!")

if __name__ == "__main__":
    main()
