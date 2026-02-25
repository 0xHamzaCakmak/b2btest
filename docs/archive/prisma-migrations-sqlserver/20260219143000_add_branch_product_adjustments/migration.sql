BEGIN TRY

BEGIN TRAN;

CREATE TABLE [dbo].[branch_product_adjustments] (
  [id] NVARCHAR(1000) NOT NULL,
  [branch_id] NVARCHAR(1000) NOT NULL,
  [product_id] NVARCHAR(1000) NOT NULL,
  [extra_amount] DECIMAL(12,2) NOT NULL CONSTRAINT [branch_product_adjustments_extra_amount_df] DEFAULT 0,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [branch_product_adjustments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  [updated_at] DATETIME2 NOT NULL,
  CONSTRAINT [branch_product_adjustments_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [uq_branch_product_adjustments_branch_product] UNIQUE NONCLUSTERED ([branch_id], [product_id]),
  CONSTRAINT [branch_product_adjustments_branch_id_fkey] FOREIGN KEY ([branch_id]) REFERENCES [dbo].[branches]([id]) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT [branch_product_adjustments_product_id_fkey] FOREIGN KEY ([product_id]) REFERENCES [dbo].[products]([id]) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE NONCLUSTERED INDEX [idx_branch_product_adjustments_branch_id] ON [dbo].[branch_product_adjustments]([branch_id]);
CREATE NONCLUSTERED INDEX [idx_branch_product_adjustments_product_id] ON [dbo].[branch_product_adjustments]([product_id]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
