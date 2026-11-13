// Публичная конфигурация клиента. При деплое на GitHub Pages файл перезаписывается workflow'ом
// из переменных репозитория SUPABASE_URL и SUPABASE_ANON_KEY (см. README, раздел «Вход и облако»).
// Для локального запуска впишите значения сюда.
// Допустим только anon / publishable ключ: он публичный по дизайну и защищён политиками RLS.
// Никогда не вставляйте service_role-ключ и client secret Google / GitHub: они хранятся только в панели Supabase.
window.FORM_CONFIG={supabaseUrl:"",supabaseAnonKey:""};
