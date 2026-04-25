---
description: Запустить полный конвейер написания одной статьи. Использование - /write-article {category} {topic}. Категории - fiz / yur / vzysk / news.
argument-hint: <category> <topic>
---

Запусти конвейер написания одной статьи для сайта Ликвидатор.

Аргументы: $ARGUMENTS

Формат: первое слово - категория (`fiz`, `yur`, `vzysk` или `news`), всё остальное - тема.

## Конвейер (строго последовательно)

1. Запусти агента `1-semantics` с category и topic. Дождись `drafts/{slug}/brief.json`. Если вернул `error: cannibalization` - сообщи и остановись.
2. Запусти агента `2-legal-research` с slug. Дождись `drafts/{slug}/research.json`.
3. Запусти агента `3-architect`. Дождись `drafts/{slug}/outline.json`.
4. Запусти агента `4-writer`. Дождись `drafts/{slug}/draft.md`.
5. Запусти агента `5-uniqueness`. Если `passed: false` - возврат на агента 4 с указанием угла. Максимум 3 итерации, после - в `drafts/_review/`.
6. Запусти агента `6-seo-editor`. Дождись `drafts/{slug}/article.html` + `meta.json`. Если `factcheck_passed: false` - возврат на агента 4.
7. Запусти агента `7-publisher`. По умолчанию режим `draft` (не публикуем на сайт первые 2 недели).

## Отчёт по завершении
Кратко: slug, категория, длина статьи, прошёл ли uniqueness и factcheck, режим публикации, путь к готовому файлу.

## Если конвейер упал
Указать на каком агенте, что в логах, какой файл получился последним. Не пытаться "почистить" частичные drafts/ - оставить как есть для разбора.
