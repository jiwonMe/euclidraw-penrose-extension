import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { COMMANDS, EDITOR_PANEL_ID, PENROSE_ASPECT_ID } from './manifest.js';
import { readSource, sourceKey } from './defaults.js';
import { ensureRendered } from './compile.js';

const TABS = [
  { id: 'domain', label: '.domain', hint: '타입 · 술어 · 함수' },
  { id: 'substance', label: '.substance', hint: '객체 · 사실' },
  { id: 'style', label: '.style', hint: '도형 · 제약 · 레이아웃' },
];

const ui = {
  text: 'var(--alid-text, #18181b)',
  muted: 'var(--alid-text-muted, #71717a)',
  secondary: 'var(--alid-text-secondary, #52525b)',
  border: 'var(--alid-border-subtle, #e4e4e7)',
  surface: 'var(--alid-bg-surface, #ffffff)',
  mutedSurface: 'var(--alid-bg-muted, #f4f4f5)',
  accent: 'var(--alid-accent, #2386F0)',
  accentSoft: 'var(--alid-accent-soft, #eaf4ff)',
  danger: 'var(--alid-danger, #dc2626)',
  success: 'var(--alid-success, #16a34a)',
  mono: 'var(--alid-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  sans: 'var(--alid-font, system-ui, -apple-system, "Segoe UI", sans-serif)',
};

function readSelected(context) {
  if (!context) return null;
  for (const id of context.getSelectedIds?.() ?? []) {
    const props = context.world?.getCanonical?.(id, PENROSE_ASPECT_ID);
    if (props) return { id, props: readSource(props) };
  }
  return null;
}

function tabLabel(tab, draft) {
  const count = draft?.[tab.id]?.split('\n').length ?? 0;
  return `${tab.label} ${count}`;
}

function CodeEditor({ value, onChange, onApply, ariaLabel }) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const lineCount = useMemo(() => String(value ?? '').split('\n').length, [value]);

  const insertText = text => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    });
  };

  const handleKeyDown = event => {
    const command = event.metaKey || event.ctrlKey;
    if (command && (event.key === 'Enter' || event.key.toLowerCase() === 's')) {
      event.preventDefault();
      onApply();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      if (event.shiftKey) {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart ?? 0;
        const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        const remove = value.slice(lineStart, lineStart + 2) === '  ' ? 2 : value.slice(lineStart, lineStart + 1) === ' ' ? 1 : 0;
        if (!remove) return;
        const next = value.slice(0, lineStart) + value.slice(lineStart + remove);
        onChange(next);
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, start - remove);
        });
      } else {
        insertText('  ');
      }
    }
  };

  return React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        flex: '1 1 auto',
        minHeight: 0,
        border: `1px solid ${ui.border}`,
        borderRadius: 9,
        overflow: 'hidden',
        background: ui.surface,
        boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.02)',
      },
    },
    React.createElement(
      'div',
      {
        ref: gutterRef,
        'aria-hidden': 'true',
        style: {
          flex: '0 0 auto',
          minWidth: 36,
          padding: '10px 8px 40px 10px',
          textAlign: 'right',
          color: ui.muted,
          background: ui.mutedSurface,
          borderRight: `1px solid ${ui.border}`,
          font: `10.5px/1.55 ${ui.mono}`,
          userSelect: 'none',
          overflow: 'hidden',
        },
      },
      Array.from({ length: lineCount }, (_, index) =>
        React.createElement('div', { key: index }, index + 1),
      ),
    ),
    React.createElement('textarea', {
      ref: textareaRef,
      value,
      onChange: event => onChange(event.target.value),
      onKeyDown: handleKeyDown,
      onScroll: event => {
        if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
      },
      'aria-label': ariaLabel,
      spellCheck: false,
      autoCapitalize: 'off',
      autoCorrect: 'off',
      wrap: 'off',
      style: {
        flex: '1 1 auto',
        minWidth: 0,
        minHeight: 230,
        resize: 'vertical',
        border: 0,
        outline: 'none',
        padding: '10px 12px 40px',
        background: 'transparent',
        color: ui.text,
        font: `11.5px/1.55 ${ui.mono}`,
        tabSize: 2,
        whiteSpace: 'pre',
        overflow: 'auto',
      },
    }),
  );
}

function StatusLine({ busy, dirty, status, external, onReload }) {
  const item = status ?? (dirty ? { kind: 'dirty', message: '저장되지 않은 변경' } : { kind: 'idle', message: '문서와 동기화됨' });
  const color = item.kind === 'error' ? ui.danger : item.kind === 'ok' ? ui.success : item.kind === 'dirty' ? ui.accent : ui.muted;
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 7, minHeight: 18, font: `11.5px/1.35 ${ui.sans}`, color } },
      React.createElement('span', {
        style: {
          width: 6,
          height: 6,
          flex: '0 0 auto',
          borderRadius: 999,
          background: busy ? ui.accent : color,
          boxShadow: busy ? `0 0 0 3px ${ui.accentSoft}` : 'none',
        },
      }),
      React.createElement('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, item.message),
    ),
    item.kind === 'error'
      ? React.createElement(
          'pre',
          {
            style: {
              margin: 0,
              maxHeight: 132,
              overflow: 'auto',
              padding: '8px 10px',
              borderRadius: 7,
              border: `1px solid color-mix(in srgb, ${ui.danger} 36%, transparent)`,
              background: `color-mix(in srgb, ${ui.danger} 7%, ${ui.surface})`,
              color: ui.danger,
              font: `10.5px/1.45 ${ui.mono}`,
              whiteSpace: 'pre-wrap',
            },
          },
          item.message,
        )
      : null,
    external
      ? React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 9px',
              borderRadius: 7,
              border: `1px solid ${ui.border}`,
              background: ui.mutedSurface,
              color: ui.secondary,
              font: `11px/1.35 ${ui.sans}`,
            },
          },
          React.createElement('span', null, '캔버스에서 소스가 변경되었습니다.'),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: onReload,
              style: {
                border: 0,
                background: 'transparent',
                color: ui.accent,
                font: `600 11px/1 ${ui.sans}`,
                cursor: 'pointer',
                padding: 2,
              },
            },
            '불러오기',
          ),
        )
      : null,
  );
}

export function PenroseEditorPanel({ context }) {
  const [tick, setTick] = useState(0);
  const [entityId, setEntityId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [activeTab, setActiveTab] = useState('domain');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [external, setExternal] = useState(false);

  useEffect(() => {
    if (!context) return undefined;
    const bump = () => setTick(value => value + 1);
    const offs = [context.onSelectionChange?.(bump), context.onWorldMutated?.(bump)];
    return () => {
      for (const off of offs) off?.();
    };
  }, [context]);

  const selected = useMemo(() => {
    void tick;
    return readSelected(context);
  }, [context, tick]);

  const canonicalKey = selected ? sourceKey(selected.props) : '';
  const dirty = Boolean(draft && baseline && sourceKey(draft) !== baseline);

  const load = useCallback(item => {
    if (!item) {
      setEntityId(null);
      setDraft(null);
      setBaseline('');
      setExternal(false);
      return;
    }
    setEntityId(item.id);
    setDraft(readSource(item.props));
    setBaseline(sourceKey(item.props));
    setStatus(null);
    setExternal(false);
  }, []);

  useEffect(() => {
    if (!selected) {
      if (entityId !== null) load(null);
      return;
    }
    if (selected.id !== entityId) {
      load(selected);
      return;
    }
    if (canonicalKey === baseline) {
      setExternal(false);
      return;
    }
    if (draft && sourceKey(draft) === baseline) load(selected);
    else setExternal(true);
  }, [selected?.id, canonicalKey]);

  const update = (field, value) => {
    setDraft(current => current ? { ...current, [field]: value } : current);
    setStatus(null);
  };

  const apply = useCallback(async () => {
    if (!context || !selected || !draft || busy) return;
    setBusy(true);
    setStatus({ kind: 'working', message: '적용하고 Penrose를 컴파일하는 중…' });
    const applied = readSource(draft);
    try {
      await context.executeCommand(COMMANDS.apply, { entityId: selected.id, ...applied });
      setDraft(applied);
      setBaseline(sourceKey(applied));
      setExternal(false);
      const entry = ensureRendered(applied, selected.id);
      const settled = await entry.promise;
      if (settled.status === 'ready') {
        setStatus({ kind: 'ok', message: `적용됨 · ${settled.durationMs ?? 0}ms에 컴파일` });
      } else {
        setStatus({ kind: 'error', message: settled.error || 'Penrose 컴파일 오류' });
      }
    } catch (error) {
      setStatus({ kind: 'error', message: String(error?.message ?? error) });
    } finally {
      setBusy(false);
    }
  }, [context, selected, draft, busy]);

  const insert = async () => {
    if (!context || busy) return;
    setBusy(true);
    setStatus({ kind: 'working', message: '새 Penrose 다이어그램을 만드는 중…' });
    try {
      const id = await context.executeCommand(COMMANDS.insert, {});
      if (!id) setStatus({ kind: 'error', message: '다이어그램을 만들지 못했습니다. canvas.creation 서비스를 확인하세요.' });
      else setStatus({ kind: 'ok', message: '새 다이어그램을 만들었습니다. 이제 소스를 편집하세요.' });
    } catch (error) {
      setStatus({ kind: 'error', message: String(error?.message ?? error) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!context || !selected || busy) return;
    if (typeof globalThis.confirm === 'function' && !globalThis.confirm('이 Penrose 다이어그램의 소스를 기본 예제로 되돌릴까요?')) return;
    setBusy(true);
    setStatus({ kind: 'working', message: '기본 예제로 되돌리는 중…' });
    try {
      await context.executeCommand(COMMANDS.reset, { entityId: selected.id });
      setStatus({ kind: 'ok', message: '기본 예제로 되돌렸습니다.' });
    } catch (error) {
      setStatus({ kind: 'error', message: String(error?.message ?? error) });
    } finally {
      setBusy(false);
    }
  };

  const recompile = async () => {
    if (!context || !selected || busy) return;
    setBusy(true);
    setStatus({ kind: 'working', message: '다시 렌더링하는 중…' });
    try {
      await context.executeCommand(COMMANDS.recompile, { entityId: selected.id });
      const props = context.world?.getCanonical?.(selected.id, PENROSE_ASPECT_ID);
      const entry = ensureRendered(readSource(props), selected.id);
      const settled = await entry.promise;
      setStatus(settled.status === 'ready'
        ? { kind: 'ok', message: `다시 렌더링했습니다 · ${settled.durationMs ?? 0}ms` }
        : { kind: 'error', message: settled.error || 'Penrose 컴파일 오류' });
    } catch (error) {
      setStatus({ kind: 'error', message: String(error?.message ?? error) });
    } finally {
      setBusy(false);
    }
  };

  if (!draft) {
    return React.createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 12, padding: 14, font: `12px/1.5 ${ui.sans}`, color: ui.text } },
      React.createElement('div', { style: { fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' } }, 'Penrose 다이어그램'),
      React.createElement(
        'div',
        { style: { color: ui.secondary } },
        '캔버스에서 Penrose 다이어그램을 선택하면 .domain · .substance · .style 소스를 이 패널에서 편집할 수 있습니다.',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: insert,
          disabled: busy,
          style: {
            alignSelf: 'flex-start',
            border: 0,
            borderRadius: 7,
            padding: '7px 12px',
            background: busy ? ui.mutedSurface : ui.text,
            color: busy ? ui.muted : ui.surface,
            font: `600 12px/1 ${ui.sans}`,
            cursor: busy ? 'default' : 'pointer',
          },
        },
        '새 Penrose 다이어그램',
      ),
      React.createElement(StatusLine, { busy, dirty: false, status, external: false, onReload: () => {} }),
    );
  }

  const active = TABS.find(tab => tab.id === activeTab) ?? TABS[0];
  const shortId = selected?.id ? selected.id.slice(0, 8) : '';

  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, font: `12px/1.45 ${ui.sans}`, color: ui.text } },
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 } },
      React.createElement(
        'div',
        { style: { minWidth: 0 } },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 7 } },
          React.createElement('span', { style: { fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' } }, 'Penrose 다이어그램'),
          shortId ? React.createElement(
            'span',
            {
              title: selected.id,
              style: {
                padding: '1px 6px',
                borderRadius: 999,
                border: `1px solid ${ui.border}`,
                color: ui.muted,
                font: `10px/1.5 ${ui.mono}`,
                background: ui.mutedSurface,
              },
            },
            `#${shortId}`,
          ) : null,
        ),
        React.createElement('div', { style: { marginTop: 2, color: ui.muted, fontSize: 11 } }, '선택한 컴포넌트의 Penrose 소스'),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: apply,
          disabled: busy || !dirty,
          title: 'Ctrl/⌘ + Enter',
          style: {
            flex: '0 0 auto',
            border: 0,
            borderRadius: 7,
            padding: '7px 13px',
            background: busy || !dirty ? ui.mutedSurface : ui.text,
            color: busy || !dirty ? ui.muted : ui.surface,
            font: `600 12px/1 ${ui.sans}`,
            cursor: busy || !dirty ? 'default' : 'pointer',
            transition: 'background 120ms ease',
          },
        },
        busy ? '적용 중…' : '적용',
      ),
    ),

    React.createElement(
      'div',
      { style: { display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: ui.mutedSurface, border: `1px solid ${ui.border}` } },
      TABS.map(tab =>
        React.createElement(
          'button',
          {
            key: tab.id,
            type: 'button',
            onClick: () => setActiveTab(tab.id),
            title: tab.hint,
            style: {
              flex: '1 1 0',
              minWidth: 0,
              border: 0,
              borderRadius: 6,
              padding: '6px 4px',
              background: activeTab === tab.id ? ui.surface : 'transparent',
              color: activeTab === tab.id ? ui.text : ui.secondary,
              boxShadow: activeTab === tab.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              font: `${activeTab === tab.id ? 600 : 500} 11px/1.2 ${ui.mono}`,
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          },
          tabLabel(tab, draft),
        ),
      ),
    ),

    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 7 } },
      React.createElement('label', { style: { color: ui.muted, font: `10.5px/1.2 ${ui.mono}`, flex: '0 0 auto' } }, 'variation'),
      React.createElement('input', {
        value: draft.variation,
        onChange: event => update('variation', event.target.value),
        'aria-label': 'Penrose variation (layout seed)',
        spellCheck: false,
        style: {
          flex: '1 1 auto',
          minWidth: 0,
          border: `1px solid ${ui.border}`,
          borderRadius: 6,
          padding: '4px 7px',
          background: ui.surface,
          color: ui.text,
          font: `10.5px/1.4 ${ui.mono}`,
          outline: 'none',
        },
      }),
    ),

    React.createElement(CodeEditor, {
      value: draft[active.id],
      onChange: value => update(active.id, value),
      onApply: apply,
      ariaLabel: `Penrose ${active.label} 소스`,
    }),

    React.createElement(StatusLine, {
      busy,
      dirty,
      status,
      external,
      onReload: () => load(selected),
    }),

    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' } },
      React.createElement(
        'div',
        { style: { color: ui.muted, fontSize: 10.5, lineHeight: 1.4 } },
        'Ctrl/⌘ + Enter 또는 Ctrl/⌘ + S로 적용',
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', gap: 6 } },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: recompile,
            disabled: busy,
            style: {
              border: `1px solid ${ui.border}`,
              borderRadius: 6,
              padding: '5px 8px',
              background: ui.surface,
              color: ui.secondary,
              font: `500 10.5px/1.2 ${ui.sans}`,
              cursor: busy ? 'default' : 'pointer',
            },
          },
          '다시 렌더',
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: reset,
            disabled: busy,
            style: {
              border: `1px solid ${ui.border}`,
              borderRadius: 6,
              padding: '5px 8px',
              background: ui.surface,
              color: ui.secondary,
              font: `500 10.5px/1.2 ${ui.sans}`,
              cursor: busy ? 'default' : 'pointer',
            },
          },
          '예제 복원',
        ),
      ),
    ),
  );
}

export function createEditorPanelSpec() {
  return {
    panelId: EDITOR_PANEL_ID,
    title: 'Penrose 소스',
    icon: {
      paths: [
        'M4 5.5h12',
        'M4 10h8',
        'M4 14.5h12',
        'M17.5 8.5 20 11l-2.5 2.5',
      ],
    },
    defaultZone: 'right',
    inspectorFor: PENROSE_ASPECT_ID,
    isolation: 'container',
    mount(hostEl, context) {
      if (!hostEl) return () => {};
      const doc = hostEl.ownerDocument;
      if (!doc || typeof doc.createElement !== 'function') {
        hostEl.textContent = 'Penrose 소스';
        return () => {
          hostEl.textContent = '';
        };
      }
      const root = createRoot(hostEl);
      root.render(React.createElement(PenroseEditorPanel, { context }));
      return () => {
        try {
          root.unmount();
        } catch {
          // Ignore unmount errors during host teardown.
        }
      };
    },
  };
}
