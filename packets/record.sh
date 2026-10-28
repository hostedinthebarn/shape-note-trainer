#!/bin/sh
# Copy a packet run's evidence next to its packet: the ladder record, plus the prompt, reply and
# test log of the passing try. Usage: packets/record.sh <component> <packet-run workdir>
set -eu
c=$1; w=$2
dir=$(dirname "$0")/$c/run
mkdir -p "$dir"
cp "$w/$c/ladder.json" "$dir/"
run=$(/opt/homebrew/bin/python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['workdir'])" "$w/$c/ladder.json")
n=$(ls "$run"/test-*.txt | sed 's/.*test-\([0-9]*\)\.txt/\1/' | sort -n | tail -1)
cp "$run/prompt-$n.md" "$run/reply-$n.txt" "$run/test-$n.txt" "$dir/"
echo "$c: recorded try $n from $run"
