CREATE TABLE `contactNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`contactId` int NOT NULL,
	`content` text NOT NULL,
	`authorType` enum('human','ai','system') NOT NULL DEFAULT 'ai',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contactNotes_id` PRIMARY KEY(`id`)
);
