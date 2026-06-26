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

const MAX_PX = 1024;
const JPEG_QUALITY = 0.82;

function fileToBase64(file) {
  const isPdf = file.type === 'application/pdf';

  if (isPdf) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        type: 'pdf', mediaType: 'application/pdf',
        data: reader.result.split(',')[1], name: file.name,
      });
      reader.readAsDataURL(file);
    });
  }

  // Resize image to MAX_PX on longest side before encoding
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({
        type: 'image', mediaType: 'image/jpeg',
        data: canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1],
        name: file.name,
      });
    };
    img.src = url;
  });
}
