#!/usr/bin/env bash
# Снимки рабочей копии в отдельную ветку — страховка от потери правок.
#
# ## Откуда взялся
#
# Написан во время поиска «откатов рабочей копии»: правки в отслеживаемых
# файлах будто исчезали. Причина оказалась другой и куда проще — правки
# уходили в `.next/standalone`, полную копию репозитория, потому что рабочий
# каталог оболочки оставался там после запуска предпросмотра. Отката не было
# никогда; от этого теперь защищает `.claude/hooks/guard-cwd.sh`.
#
# Скрипт всё равно оставлен: дешёвая страховка на случай любой другой потери
# (неудачный `git checkout --`, перепутанный путь, оборванная правка).
#
# ## Как устроен
#
# Каждые N секунд снимает дерево целиком, включая неотслеживаемые файлы, в
# ветку `refs/wip`. Снимок берётся через отдельный индекс (`GIT_INDEX_FILE`),
# поэтому не трогает ни рабочий индекс, ни HEAD, ни текущую ветку: `git
# status` после снимка выглядит ровно так же, как до него.
#
# Достать потерянное:
#     git show refs/wip:lib/fan.ts > lib/fan.ts
#     git log --oneline refs/wip
#     git diff refs/wip -- lib/fan.ts
#
# Заодно ведёт журнал `.git/wip-guard.log`: если файл вернулся к версии HEAD
# без коммита, туда пишется время, список файлов и живые процессы. Проверка
# пофайловая, а не по дереву целиком — частичную потерю сравнение с HEAD не
# заметило бы вовсе.
#
# Запуск на всю сессию:
#     ./scripts/wip-guard.sh &
# Остановка:
#     pkill -f wip-guard.sh
set -uo pipefail

cd "$(dirname "$0")/.."
INTERVAL="${WIP_GUARD_INTERVAL:-15}"
LOG=".git/wip-guard.log"
INDEX=".git/wip-index"

say() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" >> "$LOG"; }

# Дерево рабочей копии как объект. Возвращает sha или пустую строку.
snapshot_tree() {
  rm -f "$INDEX"
  GIT_INDEX_FILE="$INDEX" git read-tree HEAD 2>/dev/null || return 1
  GIT_INDEX_FILE="$INDEX" git add -A 2>/dev/null || return 1
  GIT_INDEX_FILE="$INDEX" git write-tree 2>/dev/null
}

say "guard started, interval ${INTERVAL}s"
prev_tree=""
prev_head=""

# Версия файла в дереве или NONE, если файла там нет.
blob_at() { git rev-parse "$1:$2" 2>/dev/null || echo NONE; }

while true; do
  head="$(git rev-parse HEAD 2>/dev/null || echo "")"
  tree="$(snapshot_tree || echo "")"

  if [[ -n "$tree" && -n "$prev_tree" && "$tree" != "$prev_tree" && "$head" == "$prev_head" ]]; then
    # Ищем откат пофайлово, а не по дереву целиком. Наблюдавшийся случай был
    # именно частичным: два файла вернулись к версии HEAD, а соседние правки
    # и неотслеживаемые файлы остались на месте. Проверка «дерево совпало с
    # HEAD» такого не видит вовсе — на этом первая версия ловушки и промахнулась.
    reverted=""
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      now="$(blob_at "$tree" "$f")"
      was="$(blob_at "$prev_tree" "$f")"
      at_head="$(blob_at "HEAD" "$f")"
      if [[ "$now" == "$at_head" && "$was" != "$at_head" ]]; then
        reverted+="$f "
      fi
    done < <(git diff --name-only "$prev_tree" "$tree" 2>/dev/null)

    if [[ -n "$reverted" ]]; then
      say "ОТКАТ ФАЙЛОВ К HEAD БЕЗ КОММИТА: $reverted"
      say "  процессы: $(ps -eo pid,etimes,args --no-headers 2>/dev/null | grep -vE '\[|wip-guard|ps -eo' | head -15 | tr -s ' ' | tr '\n' '|')"
      say "  прежнее состояние сохранено: git show ${prev_tree}:<файл>"
    fi
  fi

  if [[ -n "$tree" && "$tree" != "$prev_tree" ]]; then
    parent="$(git rev-parse -q --verify refs/wip 2>/dev/null || git rev-parse HEAD)"
    commit="$(git commit-tree "$tree" -p "$parent" -m "wip $(date -u +%FT%TZ)" 2>/dev/null)"
    [[ -n "$commit" ]] && git update-ref refs/wip "$commit"
  fi

  [[ -n "$tree" ]] && prev_tree="$tree"
  prev_head="$head"
  sleep "$INTERVAL"
done
