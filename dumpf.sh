#!/usr/bin/env bash

OUTPUT_FILE="all_files_dump.txt"

rm -f "$OUTPUT_FILE"

find . \
  -path './node_modules' -prune -o \
  -path './.venv' -prune -o \
  -path './package-lock.json' -prune -o \
  -path './public' -prune -o \
  -path './.venv1' -prune -o \
  -path './alembic' -prune -o \
  -path './idea' -prune -o \
  -path './static' -prune -o \
  -path './.git' -prune -o \
  -path './justfile' -prune -o \
  -path './.idea' -prune -o \
  -path '*/__pycache__' -prune -o \
  -path './fonts' -prune -o \
  -path './assets' -prune -o \
  -path './logs' -prune -o \
  -name '*.pyc' -prune -o \
  -name '*.gitignore' -prune -o \
  -name '*.toml' -prune -o \
  -name '*.lock' -prune -o \
  -name '*.lock' -prune -o \
  -name '.DS_Store' -prune -o \
  -name '*.json' -prune -o \
  -type f ! -name "$(basename "$0")" \
  -print | while read -r file; do
    echo "# $file" >> "$OUTPUT_FILE"
    cat "$file" >> "$OUTPUT_FILE"
    echo -e "\n" >> "$OUTPUT_FILE"
done

echo "Готово! Содержимое всех файлов сохранено в $OUTPUT_FILE"
