import React, { useState } from 'react';
import { X, Plus, Server, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useSenders, useCreateSender } from '../../hooks/useSenders';

interface SenderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SenderModal: React.FC<SenderModalProps> = ({ isOpen, onClose }) => {
  const { data: senders, isLoading } = useSenders();
  const createMutation = useCreateSender();

  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.ethereal.email');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await createMutation.mutateAsync({
        name,
        email,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_password: smtpPassword,
      });

      setShowAddForm(false);
      setName('');
      setEmail('');
      setSmtpUser('');
      setSmtpPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to add sender identity.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">Sender Identities (SMTP)</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* List of senders */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Configured Senders
              </span>
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus size={14} /> Add Sender
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="text-xs text-muted-foreground p-4 text-center">Loading senders...</div>
            ) : senders && senders.length > 0 ? (
              senders.map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-xl border border-border bg-secondary/30 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-semibold text-foreground">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.email}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                    <Check size={14} />
                    <span>Active</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground p-4 text-center border border-dashed rounded-xl">
                No senders configured yet.
              </div>
            )}
          </div>

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={handleAdd} className="pt-4 border-t border-border space-y-3">
              <h3 className="text-xs font-bold text-foreground">Add New Ethereal / SMTP Sender</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Outreach Specialist"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">From Email</label>
                  <input
                    type="email"
                    required
                    placeholder="outreach@ethereal.email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold mb-1">SMTP Host</label>
                  <input
                    type="text"
                    required
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">Port</label>
                  <input
                    type="number"
                    required
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                    className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold mb-1">SMTP Username</label>
                  <input
                    type="text"
                    required
                    placeholder="ethereal user"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1">SMTP Password</label>
                  <input
                    type="password"
                    required
                    placeholder="ethereal pass"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground"
                >
                  {createMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
                  <span>Save Sender</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
