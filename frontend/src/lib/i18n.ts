'use client';
import { useEffect, useState } from 'react';

const dict = {
  ru: {
    dashboard: 'Дашборд',
    users: 'Пользователи',
    nodes: 'Ноды',
    inbounds: 'Подключения',
    settings: 'Настройки',
    logout: 'Выйти',
    login: 'Вход',
    email: 'Email',
    password: 'Пароль',
    signIn: 'Войти',
    totalUsers: 'Всего пользователей',
    activeUsers: 'Активных',
    totalNodes: 'Всего нод',
    onlineNodes: 'Онлайн',
    trafficUsed: 'Трафик',
    create: 'Создать',
    save: 'Сохранить',
    cancel: 'Отмена',
    edit: 'Изменить',
    delete: 'Удалить',
    search: 'Поиск',
    status: 'Статус',
    role: 'Роль',
    trafficLimit: 'Лимит трафика',
    expiresAt: 'Срок действия',
    subscription: 'Подписка',
    actions: 'Действия',
    apply: 'Применить',
    restart: 'Перезапустить',
    health: 'Состояние',
    address: 'Адрес',
    port: 'Порт',
    name: 'Название',
    token: 'Токен',
    language: 'Язык',
    theme: 'Тема',
    loading: 'Загрузка...',
    noData: 'Нет данных',
    copy: 'Копировать',
    subscriptionPage: 'Страница подписки',
    traffic: 'Трафик',
    connections: 'Подключения',
    expiry: 'Действует до',
    availableFormats: 'Форматы подписки',
    instructions: 'Инструкции',
  },
  en: {
    dashboard: 'Dashboard',
    users: 'Users',
    nodes: 'Nodes',
    inbounds: 'Inbounds',
    settings: 'Settings',
    logout: 'Logout',
    login: 'Login',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    totalUsers: 'Total users',
    activeUsers: 'Active',
    totalNodes: 'Total nodes',
    onlineNodes: 'Online',
    trafficUsed: 'Traffic',
    create: 'Create',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    search: 'Search',
    status: 'Status',
    role: 'Role',
    trafficLimit: 'Traffic limit',
    expiresAt: 'Expires at',
    subscription: 'Subscription',
    actions: 'Actions',
    apply: 'Apply',
    restart: 'Restart',
    health: 'Health',
    address: 'Address',
    port: 'Port',
    name: 'Name',
    token: 'Token',
    language: 'Language',
    theme: 'Theme',
    loading: 'Loading...',
    noData: 'No data',
    copy: 'Copy',
    subscriptionPage: 'Subscription page',
    traffic: 'Traffic',
    connections: 'Connections',
    expiry: 'Expires',
    availableFormats: 'Subscription formats',
    instructions: 'Instructions',
  },
};

export type Lang = keyof typeof dict;
export type Dict = typeof dict.en;

export function useLang() {
  const [lang, setLang] = useState<Lang>('ru');
  useEffect(() => {
    const stored = (localStorage.getItem('xss_lang') as Lang) || 'ru';
    setLang(stored);
  }, []);
  const toggle = () => {
    const next: Lang = lang === 'ru' ? 'en' : 'ru';
    setLang(next);
    localStorage.setItem('xss_lang', next);
  };
  return { lang, t: dict[lang] as Dict, toggle };
}
