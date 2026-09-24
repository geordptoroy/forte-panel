CREATE TABLE `apiIdempotency` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int,
	`key` varchar(180) NOT NULL,
	`fingerprint` varchar(128) NOT NULL,
	`statusCode` int NOT NULL DEFAULT 200,
	`responseBody` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `apiIdempotency_id` PRIMARY KEY(`id`),
	CONSTRAINT `apiIdempotency_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `webhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workspaceId` int,
	`eventId` varchar(180) NOT NULL,
	`provider` varchar(60) NOT NULL DEFAULT 'whatsapp',
	`payload` text NOT NULL,
	`status` enum('received','processed','failed') NOT NULL DEFAULT 'received',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `webhookEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhookEvents_eventId_unique` UNIQUE(`eventId`)
);
