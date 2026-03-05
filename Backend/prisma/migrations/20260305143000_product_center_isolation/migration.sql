-- Add center scope to products
ALTER TABLE `products`
  ADD COLUMN `center_id` VARCHAR(191) NULL;

-- Backfill legacy global products under Default Center
INSERT INTO `centers` (
  `id`,
  `name`,
  `manager`,
  `phone`,
  `email`,
  `address`,
  `is_active`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  'Default Center',
  NULL,
  NULL,
  NULL,
  'Legacy global products',
  true,
  NOW(3),
  NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `centers` WHERE `name` = 'Default Center'
);

SET @default_center_id = (
  SELECT `id`
  FROM `centers`
  WHERE `name` = 'Default Center'
  ORDER BY `created_at` ASC
  LIMIT 1
);

UPDATE `products`
SET `center_id` = @default_center_id
WHERE `center_id` IS NULL;

-- Replace global uniqueness with center-scoped uniqueness
ALTER TABLE `products`
  DROP INDEX `products_code_key`;

ALTER TABLE `products`
  MODIFY `center_id` VARCHAR(191) NOT NULL;

CREATE INDEX `idx_products_center_id` ON `products`(`center_id`);
CREATE UNIQUE INDEX `uq_products_center_code` ON `products`(`center_id`, `code`);
CREATE UNIQUE INDEX `uq_products_center_name` ON `products`(`center_id`, `name`);

ALTER TABLE `products`
  ADD CONSTRAINT `products_center_id_fkey`
  FOREIGN KEY (`center_id`) REFERENCES `centers`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
