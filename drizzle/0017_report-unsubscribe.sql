-- Отписка от отчётов в один клик из почтового клиента (RFC 8058).
--
-- Токен нужен потому, что ссылка на настройки требует входа, а заголовок
-- List-Unsubscribe читает не человек, а Gmail или Яндекс.Почта: они шлют POST
-- сами, без сессии. Без такого адреса кнопка «отписаться» в почтовом клиенте
-- превращается в кнопку «пожаловаться на спам», и страдает доставляемость
-- всей рассылки, включая письма о сбросе пароля.
--
-- Токен живёт в настройках отчётов, а не в users: он относится к рассылке, и
-- сменить его, не трогая учётную запись, должно быть можно.
ALTER TABLE "report_preferences" ADD COLUMN IF NOT EXISTS "unsubscribe_token" text;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "report_preferences_token"
  ON "report_preferences" ("unsubscribe_token")
  WHERE "unsubscribe_token" IS NOT NULL;
