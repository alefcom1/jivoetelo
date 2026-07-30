#!/bin/bash
# Запускается в начале каждой сессии Claude Code. Две задачи, обе выросли
# из реальных потерь времени.
#
# 1. Рабочая копия в этой среде одноразовая и иногда откатывается к более
#    раннему состоянию — причём непоследовательно: часть файлов возвращается
#    назад, а новые остаются лежать неотслеживаемыми. Один раз это привело к
#    коммиту поверх устаревшей базы, который вернул уже исправленный файл на
#    двадцать строк назад. Здесь мы это ловим сразу: подтягиваем origin и,
#    если дерево чистое, перематываем ветку вперёд.
# 2. node_modules пропадают вместе с откатом, и первая же команда падает.
#
# Правило безопасности: ничего не уничтожаем. Если в дереве есть изменения,
# а ветка отстала — только громко сообщаем. Решение, что делать с чужими
# правками, за человеком.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

echo "— проверка состояния репозитория —"

# Хуки git лежат в репозитории, а не в .git/hooks: .git не переживает
# пересоздание контейнера, а .githooks — обычные файлы под контролем версий.
git config core.hooksPath .githooks 2>/dev/null

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
  echo "  ветка не определена — пропускаю синхронизацию"
else
  git fetch --quiet origin "$branch" 2>/dev/null
  upstream="origin/$branch"
  if git rev-parse --verify --quiet "$upstream" >/dev/null; then
    behind="$(git rev-list --count "HEAD..$upstream" 2>/dev/null || echo 0)"
    ahead="$(git rev-list --count "$upstream..HEAD" 2>/dev/null || echo 0)"
    dirty="$(git status --porcelain | head -c 1)"

    if [ "$behind" != "0" ] && [ -z "$dirty" ]; then
      git merge --quiet --ff-only "$upstream" && \
        echo "  копия отставала на $behind — перемотал на $upstream"
    elif [ "$behind" != "0" ]; then
      echo "  ВНИМАНИЕ: копия отстала от $upstream на $behind коммитов,"
      echo "  но в дереве есть незакоммиченные изменения — сам ничего не трогаю."
      echo "  Разберитесь вручную, прежде чем коммитить: коммит поверх устаревшей"
      echo "  базы вернёт назад уже исправленные файлы."
    else
      echo "  ветка $branch в порядке (впереди на $ahead)"
    fi
  else
    echo "  у ветки $branch нет origin — синхронизировать не с чем"
  fi
fi

# Зависимости. npm install, а не ci: состояние контейнера кэшируется после
# хука, и install переиспользует уже установленное.
if [ ! -d node_modules ]; then
  echo "— ставлю зависимости —"
  npm install --no-audit --no-fund
else
  echo "— node_modules на месте —"
fi
