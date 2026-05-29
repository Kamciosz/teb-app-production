#!/usr/bin/env python3
"""Auto-generuje shell completion z aktualnych komend. Uruchom po dodaniu nowej komendy."""
import os, re

MANAGER = os.path.expanduser("~/Desktop/teb-app-production/scripts/teb-app-manager.py")
OUTPUT = os.path.expanduser("~/Desktop/teb-app-production/scripts/teb-app-completion.sh")

with open(MANAGER) as f:
    code = f.read()

# Extract commands from the cmds dict
cmd_match = re.search(r'cmds\s*=\s*\{(.*?)\}', code, re.DOTALL)
if not cmd_match: print("Nie znaleziono komend"); exit(1)

cmds_text = cmd_match.group(1)
commands = re.findall(r'"(\w[-\w]*)"\s*:\s*cmd_', cmds_text)
commands.sort()

# Extract descriptions from docstrings
descriptions = {}
for cmd in commands:
    fn_name = "cmd_" + cmd.replace("-", "_")
    # Find the docstring
    pattern = fn_name + r'\(args\):\s*\n\s+"""(.*?)"""'
    m = re.search(pattern, code, re.DOTALL)
    if m:
        desc = m.group(1).split("\n")[0].strip()
        descriptions[cmd] = desc

# Generate completion
lines = ['#!/usr/bin/env bash',
         '# TEB-App Manager — auto-generated shell completion',
         '# Generated: ' + __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M'),
         '# Commands: ' + str(len(commands)),
         '',
         '_teb_app_complete() {',
         '    local cur="${COMP_WORDS[COMP_CWORD]}"',
         '    local prev="${COMP_WORDS[COMP_CWORD-1]}"',
         '    local commands="' + ' '.join(commands) + '"',
         '    local filters="unconfirmed confirmed admin student tg registered"',
         '',
         '    case "${prev}" in',
         '        teb-app|teb-app-manager|python3)',
         '            COMPREPLY=($(compgen -W "${commands} --json -j" -- "${cur}"))',
         '            ;;',
         '        --filter|-f)',
         '            COMPREPLY=($(compgen -W "${filters}" -- "${cur}"))',
         '            ;;',
         '        *)',
         '            COMPREPLY=($(compgen -W "${commands} --json -j" -- "${cur}"))',
         '            ;;',
         '    esac',
         '}',
         '',
         '# Zsh completion',
         '_teb_app_zsh() {',
         '    local -a commands',
         '    commands=(']

for cmd in commands:
    desc = descriptions.get(cmd, "")
    lines.append("        '" + cmd + ":" + desc + "'")

lines += [
    '    )',
    '    _describe "komenda" commands',
    '}',
    '',
    '# Install',
    'if [[ -n "${ZSH_VERSION:-}" ]]; then',
    '    compdef _teb_app_zsh teb-app-manager.py',
    'elif [[ -n "${BASH_VERSION:-}" ]]; then',
    '    complete -F _teb_app_complete teb-app-manager.py',
    '    complete -F _teb_app_complete python3',
    'fi',
    '',
    'echo "TEB-App completion loaded (' + str(len(commands)) + ' commands)"',
]

with open(OUTPUT, "w") as f:
    f.write("\n".join(lines) + "\n")

print("Generated: " + OUTPUT)
print("Commands: " + str(len(commands)))
