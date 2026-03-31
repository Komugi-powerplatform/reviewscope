# VHS demo tape — run with: vhs demo.tape
Output demo.gif
Set Width 900
Set Height 500
Set FontSize 14
Set Theme "Catppuccin Mocha"
Set Padding 20

Type "# Run ReviewScope against ky (popular HTTP client, 47k stars)"
Enter
Sleep 500ms

Type "cd /tmp/ky && git diff HEAD~3..HEAD | reviewscope --stdin"
Enter
Sleep 3s

Sleep 2s
