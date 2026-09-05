import { v4 as uuidv4 } from 'uuid';
import mysql from 'mysql2/promise';

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    database: 'email_scheduler',
    user: 'root',
    password: 'Anusha@123',
    timezone: '+00:00',
  });

  const userId = 'c6dcef3e-6c73-47d0-a5b9-a19b348ad71d';
  const senderId = '54de7f22-6819-4e84-9dd1-edf6b31811a7';

  // Check current count
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT count(*) as cnt FROM email_campaigns WHERE user_id = ?',
    [userId]
  );
  const currentCount = rows[0].cnt;
  console.log(`Current campaigns for user: ${currentCount}`);

  const needed = 25 - currentCount;
  if (needed <= 0) {
    console.log('Already have 25 or more campaigns. No need to seed more.');
    await connection.end();
    return;
  }

  console.log(`Seeding ${needed} additional campaigns to reach 25 total...`);

  const subjects = [
    'Q4 Sales Strategy Kickoff',
    'Follow-up: Enterprise Security Demo',
    'Welcome to the ReachInbox Beta',
    'Monthly Marketing Performance Review',
    'Exclusive Invitation: AI & Automation Summit',
    'Invoice #84920 for Cloud Hosting Services',
    'Security Advisory: Two-Factor Authentication',
    'Customer Feedback Survey — Win $100 Gift Card',
    'Product Update: Live BullMQ Event Streaming',
    'Upcoming Webinar: Scaling Cold Email Deliverability',
    'Contract Renewal for FY2027',
    'Job Opportunity: Senior Full-Stack Engineer',
    'Weekly Engineering Sprint Retro Notes',
    'VIP Customer Appreciation Perks',
    'Important System Maintenance Notification',
    'Q3 Financial Earnings Summary & Roadmap',
    'Partnership Proposal: ReachInbox & GlobalTech',
    'New Lead Enrichment Features Announcement',
    'Newsletter #42: Growth Tactics for B2B Founders',
    'Special Promo: 30% Off Annual Enterprise Tier',
  ];

  for (let i = 0; i < needed; i++) {
    const campaignId = uuidv4();
    const subject = subjects[i % subjects.length];
    const body = `<p>Hello team,</p><p>This is a scheduled communication regarding <strong>${subject}</strong>. Please review the attached deliverables and let us know if you have questions.</p><p>Best regards,<br/>ReachInbox Team</p>`;
    const totalRecipients = 5 + (i % 4) * 5; // 5, 10, 15, 20
    const delayMs = [2000, 3000, 4000, 5000][i % 4];
    const hourlyLimit = [50, 100, 200, 300][i % 4];
    const hoursAgo = (i + 1) * 2;
    const createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000);

    // Some with attachments, some without
    let attachmentsJson: string | null = null;
    if (i % 3 === 1) {
      attachmentsJson = JSON.stringify([
        { filename: 'Q4_Plan.pdf', size: 142000, contentType: 'application/pdf', content: 'c2FtcGxl' }
      ]);
    } else if (i % 3 === 2) {
      attachmentsJson = JSON.stringify([
        { filename: 'Architecture_Diagram.png', size: 320000, contentType: 'image/png', content: 'c2FtcGxl' },
        { filename: 'Terms_and_Conditions.docx', size: 85000, contentType: 'application/msword', content: 'c2FtcGxl' }
      ]);
    }

    await connection.execute(
      `INSERT INTO email_campaigns (id, user_id, sender_id, subject, body, start_time, delay_ms, hourly_limit, total_recipients, attachments, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [campaignId, userId, senderId, subject, body, createdAt, delayMs, hourlyLimit, totalRecipients, attachmentsJson, createdAt, createdAt]
    );

    // Insert corresponding recipient email rows
    const emailsToInsert = [];
    for (let r = 0; r < totalRecipients; r++) {
      const emailId = uuidv4();
      const isSent = r < Math.floor(totalRecipients * 0.7); // 70% sent
      const status = isSent ? 'sent' : (r === totalRecipients - 1 ? 'failed' : 'scheduled');
      const sentAt = isSent ? new Date(createdAt.getTime() + (r + 1) * delayMs) : null;
      emailsToInsert.push([
        emailId,
        campaignId,
        userId,
        senderId,
        `lead_${i}_${r + 1}@acme-corp.com`,
        subject,
        body,
        status,
        sentAt,
        createdAt,
        createdAt,
        `bull-job-${emailId.slice(0, 8)}`
      ]);
    }

    for (const em of emailsToInsert) {
      await connection.execute(
        `INSERT INTO emails (id, campaign_id, user_id, sender_id, recipient_email, subject, body, status, sent_at, created_at, scheduled_at, bull_job_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        em
      );
    }
  }

  const [finalRows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT count(*) as cnt FROM email_campaigns WHERE user_id = ?',
    [userId]
  );
  console.log(`Success! Total campaigns for user is now: ${finalRows[0].cnt}`);

  await connection.end();
}

main().catch(console.error);
