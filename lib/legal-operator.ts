/**
 * Реквизиты оператора персональных данных.
 *
 * Приходят из окружения, а не зашиты в код: ИП или ООО появится позже, и
 * менять реквизиты придётся без пересборки образа. Пока переменные пустые,
 * документы честно пишут «будет указано после регистрации», а не выдуманные
 * ИНН — опубликовать неверные реквизиты хуже, чем не публиковать никаких.
 *
 * Модуль серверный: значения не должны попасть в клиентский бандл, где
 * process.env всё равно пуст.
 */

export type OperatorDetails = {
  /** Наименование оператора: ИП или ООО. */
  name: string;
  inn: string;
  ogrn: string;
  address: string;
  email: string;
  /** false — реквизиты ещё не заполнены, документы это показывают явно. */
  filled: boolean;
};

const NOT_FILLED = "будет указано после регистрации юридического лица";

export function operatorDetails(): OperatorDetails {
  const name = process.env.LEGAL_OPERATOR_NAME?.trim() ?? "";
  return {
    name: name || NOT_FILLED,
    inn: process.env.LEGAL_OPERATOR_INN?.trim() || NOT_FILLED,
    ogrn: process.env.LEGAL_OPERATOR_OGRN?.trim() || NOT_FILLED,
    address: process.env.LEGAL_OPERATOR_ADDRESS?.trim() || NOT_FILLED,
    email: process.env.LEGAL_CONTACT_EMAIL?.trim() || "privacy@jivoetelo.ru",
    filled: Boolean(name),
  };
}
