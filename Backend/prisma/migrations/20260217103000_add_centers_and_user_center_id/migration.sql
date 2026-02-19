BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[centers] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [manager] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [address] NVARCHAR(1000),
    [is_active] BIT NOT NULL CONSTRAINT [centers_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [centers_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [centers_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AlterTable
ALTER TABLE [dbo].[users] ADD [center_id] NVARCHAR(1000);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_users_center_id] ON [dbo].[users]([center_id]);

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_center_id_fkey] FOREIGN KEY ([center_id]) REFERENCES [dbo].[centers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
