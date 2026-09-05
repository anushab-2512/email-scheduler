export interface EmailJobData {
  emailId: string;
  campaignId: string;
  senderId: string;
}

export interface SlackNotificationJobData {
  userId: string;
  senderId: string;
  senderEmail: string;
  hourlyLimit: number;
  hourWindow: string;
}
