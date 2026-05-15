/** Toast sukses / gagal untuk aksi undangan. */
export default function InviteToast({ toast }) {
  if (!toast) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10050,
        maxWidth: 'min(92vw, 420px)',
        padding: '0.85rem 1.1rem',
        borderRadius: '14px',
        fontSize: '0.9rem',
        fontWeight: 600,
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        border:
          toast.type === 'success'
            ? '1px solid rgba(34, 197, 94, 0.45)'
            : '1px solid rgba(239, 68, 68, 0.45)',
        background:
          toast.type === 'success' ? 'rgba(22, 163, 74, 0.18)' : 'rgba(239, 68, 68, 0.14)',
        color: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
      }}
    >
      {toast.message}
    </div>
  );
}
