// Shared lightweight renderer for the light markdown Claude uses: **bold**, --- dividers,
// and \frac{a}{b} fractions rendered as a real stacked numerator/denominator (no math library).

function Fraction({ num, den }) {
  return (
    <span style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      verticalAlign: 'middle', margin: '0 2px', fontSize: '0.85em', lineHeight: 1.15,
    }}>
      <span style={{ borderBottom: '1.5px solid currentColor', padding: '0 4px' }}>{num}</span>
      <span style={{ padding: '0 4px' }}>{den}</span>
    </span>
  );
}

const TOKEN_RE = /(\*\*[^*]+\*\*|\\frac\{[^{}]+\}\{[^{}]+\})/g;
const FRAC_RE = /^\\frac\{([^{}]+)\}\{([^{}]+)\}$/;

// Recursive so a fraction nested inside **bold** (e.g. "**3 \frac{2}{7}**") still renders as a real fraction
// instead of the whole bold span being treated as one opaque chunk of text.
function renderInline(text, keyPrefix) {
  return text.split(TOKEN_RE).filter(Boolean).map((part, j) => {
    const key = `${keyPrefix}-${j}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{renderInline(part.slice(2, -2), key)}</strong>;
    }
    const fracMatch = part.match(FRAC_RE);
    if (fracMatch) {
      return <Fraction key={key} num={fracMatch[1]} den={fracMatch[2]} />;
    }
    return part;
  });
}

function renderLine(line, key) {
  return <div key={key}>{renderInline(line, `${key}`)}</div>;
}

export function renderRichText(text) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    if (line.trim() === '---') {
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid currentColor', opacity: 0.15, margin: '8px 0' }} />;
    }
    if (line === '') {
      return <div key={i}>&nbsp;</div>;
    }
    return renderLine(line, i);
  });
}
