import React, {useSyncExternalStore} from 'react';
import {getLanguage, setLanguage, subscribeLanguage} from './language.js';
import './language.css';

export function LanguagePicker({className = ''}: {className?: string}) {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en' as const);
  return <select className={'hh-language ' + className} aria-label={language === 'en' ? 'Language' : '语言'}
    value={language} onChange={event => setLanguage(event.target.value === 'zh-CN' ? 'zh-CN' : 'en')}>
    <option lang="en" value="en">English</option>
    <option lang="zh-CN" value="zh-CN">简体中文</option>
  </select>;
}
