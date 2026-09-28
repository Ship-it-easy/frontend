# Маршрут — frontend

## Запуск

Нужен Node.js `20.19+` или `22.12+`. Сначала запустите backend и убедитесь,
что открывается <http://localhost:8000/docs>. Затем в каталоге frontend выполните:

```bash
npm ci
npm run dev
```

Откройте <http://localhost:5173> и войдите под логином `owner` с паролем,
заданным по инструкции backend. Система запускается с чистой базой без тестовых
проектов, справочников, инженеров и заявок.

## Если backend запущен на другом адресе

```bash
cp .env.example .env.local
```

Укажите адрес в `.env.local` и перезапустите `npm run dev`:

```dotenv
VITE_API_URL=http://localhost:8000
```

## Проверка сборки

```bash
npm test
npm run build
```
