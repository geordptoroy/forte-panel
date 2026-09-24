CREATE TABLE `whatsappChannels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int NOT NULL,
	`provider` enum('papi','meta_cloud_api') NOT NULL,
	`name` varchar(120) NOT NULL,
	`phoneNumber` varchar(32),
	`phoneNumberId` varchar(100),
	`credentialsRef` varchar(160),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappChannels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `provider` enum('papi','meta_cloud_api') DEFAULT 'papi' NOT NULL;