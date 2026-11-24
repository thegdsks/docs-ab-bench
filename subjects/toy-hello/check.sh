#!/bin/sh
# Passes when hello.txt holds exactly "hello" (a trailing newline is fine).
if [ -f hello.txt ] && [ "$(cat hello.txt)" = "hello" ]; then
  echo '{"pass":true}'
  exit 0
fi
echo '{"pass":false}'
exit 1
