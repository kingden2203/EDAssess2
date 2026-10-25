import { useState, useEffect } from 'react';
import { Megaphone, Pin } from 'lucide-react';
import { announcementApi } from '../../api/modulesApi';
import axiosInstance from '../../api/axiosInstance';

export default function UserAnnouncementsPage() {
  const [items, setItems] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [list, cfg] = await Promise.all([
          announcementApi.getAnnouncements(),
          axiosInstance.get('/auth/session-config').then((r) => r.data).catch(() => null),
        ]);
        setItems(Array.isArray(list) ? list : (list.results || []));
        if (cfg && cfg.announcementsEnabled === false) setEnabled(false);
      } catch (err) {
        console.error('Failed to load announcements:', err);
      } finally {
        setFetching(false);
      }
    }
    load();
  }, []);

  const sorted = [...items].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  return (
    <>
      <div className="user-topbar">
        <div className="user-topbar-left">
          <h1>Announcements</h1>
          <p>Updates posted by your instructors</p>
        </div>
      </div>

      <div className="user-content">
        <div className="user-card">
          {fetching ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--user-text-muted)' }}>Loading announcements...</div>
          ) : !enabled ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px', gap: 10, color: 'var(--user-text-muted)' }}>
              <Megaphone size={40} />
              <p style={{ margin: 0, fontSize: 13.5 }}>Announcements are currently turned off by the administrator.</p>
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px', gap: 10, color: 'var(--user-text-muted)' }}>
              <Megaphone size={40} />
              <p style={{ margin: 0, fontSize: 13.5 }}>No announcements yet.</p>
            </div>
          ) : (
            sorted.map((a) => (
              <div key={a.id} style={{ padding: '18px 22px', borderBottom: '1px solid var(--user-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  {a.pinned && (
                    <span className="u-badge u-badge-purple" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Pin size={10} /> Pinned
                    </span>
                  )}
                  {a.audience && (
                    <span className="u-badge u-badge-neutral" style={{ fontSize: 10 }}>{a.audience}</span>
                  )}
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--user-text)' }}>{a.title}</h3>
                {a.date && (
                  <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--user-text-muted)' }}>Posted {a.date}</p>
                )}
                <p style={{ margin: 0, fontSize: 13, color: 'var(--user-text-sub)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}