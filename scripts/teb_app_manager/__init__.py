"""TEB-App Manager — pip-installable package wrapper."""
import sys, os, runpy

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(REPO, "teb-app-manager.py")

def main():
    if not os.path.exists(SCRIPT):
        print("TEB-App Manager not found.", file=sys.stderr)
        sys.exit(1)
    # Run the CLI
    sys.argv[0] = SCRIPT
    with open(SCRIPT) as f:
        code = f.read()
    exec(code, {"__name__": "__main__", "__file__": SCRIPT})

if __name__ == "__main__":
    main()
