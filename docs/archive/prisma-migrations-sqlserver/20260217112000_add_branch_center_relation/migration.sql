BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[branches] ADD [center_id] NVARCHAR(1000);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_branches_center_id] ON [dbo].[branches]([center_id]);

-- AddForeignKey
ALTER TABLE [dbo].[branches] ADD CONSTRAINT [branches_center_id_fkey] FOREIGN KEY ([center_id]) REFERENCES [dbo].[centers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
