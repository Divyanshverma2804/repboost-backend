-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "address" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "hero_banner_url" TEXT,
ADD COLUMN     "highlights" TEXT,
ADD COLUMN     "maps_link" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "primary_color" TEXT DEFAULT '#6366f1',
ADD COLUMN     "tagline" TEXT;
