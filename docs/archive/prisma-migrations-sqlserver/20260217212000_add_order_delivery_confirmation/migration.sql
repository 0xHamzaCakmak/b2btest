BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[orders]
ADD [delivery_status] NVARCHAR(1000) NOT NULL CONSTRAINT [orders_delivery_status_df] DEFAULT N'TESLIM_BEKLIYOR',
    [delivered_by] NVARCHAR(1000),
    [delivered_at] DATETIME2;

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_orders_delivered_by] ON [dbo].[orders]([delivered_by]);

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_delivered_by_fkey] FOREIGN KEY ([delivered_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
