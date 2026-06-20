CREATE TABLE `indexed_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_path` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`category` text DEFAULT 'miscellaneous' NOT NULL,
	`text_content` text,
	`cloud_url` text NOT NULL,
	`cloud_path` text NOT NULL,
	`vector` blob NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `indexed_files_local_path_unique` ON `indexed_files` (`local_path`);