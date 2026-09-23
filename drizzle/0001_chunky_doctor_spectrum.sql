CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`contactId` int,
	`action` varchar(100) NOT NULL,
	`summary` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`externalPhone` varchar(32) NOT NULL,
	`name` varchar(160) NOT NULL,
	`city` varchar(100),
	`neighborhood` varchar(100),
	`serviceRequested` varchar(180),
	`urgency` enum('Baixa','Média','Alta','Crítica') NOT NULL DEFAULT 'Média',
	`stage` varchar(80) NOT NULL DEFAULT 'Novo contato',
	`aiEnabled` int NOT NULL DEFAULT 1,
	`quoteCents` int NOT NULL DEFAULT 0,
	`unreadCount` int NOT NULL DEFAULT 0,
	`lastMessagePreview` varchar(500),
	`lastMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contacts_externalPhone_unique` UNIQUE(`externalPhone`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`status` enum('open','resolved') NOT NULL DEFAULT 'open',
	`humanControlled` int NOT NULL DEFAULT 0,
	`lastMessageAt` timestamp,
	`unreadCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`externalId` varchar(160),
	`direction` enum('inbound','outbound','system') NOT NULL,
	`senderType` enum('lead','ai','human','system') NOT NULL,
	`messageType` enum('text','image','audio','video','document') NOT NULL DEFAULT 'text',
	`content` text NOT NULL,
	`status` enum('received','queued','sent','failed') NOT NULL DEFAULT 'received',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
