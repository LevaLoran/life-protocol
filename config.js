// Публичная конфигурация клиента. Подключение к Supabase задаёт ТОЛЬКО владелец:
// при деплое workflow подставляет значения из переменных репозитория SUPABASE_URL и SUPABASE_ANON_KEY
// (они имеют приоритет над значениями ниже); для локального запуска впишите ключ сюда.
// Допустим только publishable / anon ключ: он публичный по дизайну и защищён политиками RLS.
// Никогда не вставляйте secret / service_role ключ и client secret GitHub: они хранятся только в панели Supabase.
window.FORM_CONFIG={supabaseUrl:"https://zjmwqobnuhxzteeqzgzm.supabase.co",supabaseAnonKey:"sb_publishable_0ISJpofDxfvj3i6fkFQHTQ_NnM_AhAx"};
