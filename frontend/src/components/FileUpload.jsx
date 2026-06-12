import { useRef } from 'react';

export default function FileUpload({ onFiles, disabled }) {
  const inputRef = useRef(null);

  function handleChange(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    Promise.all(files.map(fileToBase64)).then(onFiles);
    e.target.value = '';
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Attach image or PDF"
        style={{
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 22,
          padding: '0 4px',
          opacity: disabled ? 0.4 : 0.7,
          lineHeight: 1,
        }}
      >
        📎
      </button>
    </>
  );
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const isPdf = file.type === 'application/pdf';
      resolve({
        type: isPdf ? 'pdf' : 'image',
        mediaType: file.type,
        data: base64,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  });
}
