import { OnboardingFlow } from "./onboarding-flow";

// Год берём на сервере и передаём вниз, а не считаем в клиентском компоненте
// на каждый ререндер: разница в единицы миллисекунд роли не играет, но так
// граница года (полночь 31 декабря) не может развести шаги друг с другом —
// весь маршрут строится от одного и того же currentYear.
export default function OnboardingPage() {
  return <OnboardingFlow currentYear={new Date().getFullYear()} />;
}
