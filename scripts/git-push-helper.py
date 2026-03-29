import subprocess
import sys
import os

def run_command(cmd):
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
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
    
    if not run_command("git add -u"): return # Only add tracked files
    if not run_command(f'git commit -m "{msg}"'): return
    if not run_command("git push"): return
    
    print("Push successful!")

if __name__ == "__main__":
    main()
