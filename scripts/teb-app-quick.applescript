-- TEB-App Manager — macOS Quick Action / Script
-- Zainstaluj: Skrypty > Dodaj do paska menu
-- lub zapisz jako aplikacje: Automator > Aplikacja

on run {input, parameters}
	set scriptPath to (POSIX path of (path to home folder)) & "Desktop/teb-app-production/scripts/teb-app-manager.py"
	
	display dialog "TEB-App Manager" buttons {"Anuluj", "Health", "Stats", "Quick", "Dashboard"} default button "Health" with icon note
	
	set choice to button returned of result
	
	if choice is "Health" then
		set cmd to "python3 " & scriptPath & " health"
	else if choice is "Stats" then
		set cmd to "python3 " & scriptPath & " stats"
	else if choice is "Quick" then
		set cmd to "python3 " & scriptPath & " quick"
	else if choice is "Dashboard" then
		set cmd to "python3 " & scriptPath & " dashboard &"
		do shell script cmd
		delay 1
		do shell script "open http://localhost:8080"
		return
	else
		return
	end if
	
	set output to do shell script cmd
	display dialog output buttons {"OK"} default button "OK" with title "TEB-App"
end run
