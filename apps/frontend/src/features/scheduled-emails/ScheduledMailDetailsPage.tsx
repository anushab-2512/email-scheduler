import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { ScheduledMailDetailsView } from './ScheduledMailDetailsView';
import { SenderModal } from '../senders/SenderModal';
import { SlackConnectModal } from '../slack/SlackConnectModal';

export const ScheduledMailDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isSenderOpen, setIsSenderOpen] = useState(false);
  const [isSlackOpen, setIsSlackOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar
        onOpenSlackModal={() => setIsSlackOpen(true)}
        onOpenSenderModal={() => setIsSenderOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ScheduledMailDetailsView
          campaignId={id}
          onBack={() => navigate('/dashboard')}
        />
      </main>

      <SenderModal
        isOpen={isSenderOpen}
        onClose={() => setIsSenderOpen(false)}
      />

      <SlackConnectModal
        isOpen={isSlackOpen}
        onClose={() => setIsSlackOpen(false)}
      />
    </div>
  );
};
