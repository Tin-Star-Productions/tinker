-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('PASS', 'FAIL', 'SKIP', 'ERROR');

-- CreateEnum
CREATE TYPE "ClassificationKind" AS ENUM ('PR_RELATED', 'FLAKY', 'INFRASTRUCTURE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('CORRECT', 'INCORRECT');

-- CreateEnum
CREATE TYPE "DigestType" AS ENUM ('EMAIL', 'SLACK');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "githubOrgId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "installationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "githubUserId" INTEGER NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "githubRepoId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CiRun" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "githubRunId" BIGINT NOT NULL,
    "prNumber" INTEGER,
    "headSha" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "conclusion" TEXT,
    "logsFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" TEXT NOT NULL,
    "ciRunId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "testSuite" TEXT,
    "status" "TestStatus" NOT NULL,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureClassification" (
    "id" TEXT NOT NULL,
    "ciRunId" TEXT NOT NULL,
    "testResultId" TEXT NOT NULL,
    "classification" "ClassificationKind" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "feedback" "FeedbackKind",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FailureClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlakyTest" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "testSuite" TEXT,
    "flakeScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlakyTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestSubscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "DigestType" NOT NULL,
    "target" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_githubOrgId_key" ON "Organization"("githubOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_installationId_key" ON "Organization"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_orgId_githubUserId_key" ON "OrgMember"("orgId", "githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_githubRepoId_key" ON "Repository"("githubRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "CiRun_githubRunId_key" ON "CiRun"("githubRunId");

-- CreateIndex
CREATE INDEX "TestResult_ciRunId_idx" ON "TestResult"("ciRunId");

-- CreateIndex
CREATE INDEX "TestResult_testName_idx" ON "TestResult"("testName");

-- CreateIndex
CREATE UNIQUE INDEX "FailureClassification_testResultId_key" ON "FailureClassification"("testResultId");

-- CreateIndex
CREATE UNIQUE INDEX "FlakyTest_repoId_testName_key" ON "FlakyTest"("repoId", "testName");

-- CreateIndex
CREATE INDEX "FlakyTest_repoId_flakeScore_idx" ON "FlakyTest"("repoId", "flakeScore");

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CiRun" ADD CONSTRAINT "CiRun_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_ciRunId_fkey" FOREIGN KEY ("ciRunId") REFERENCES "CiRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureClassification" ADD CONSTRAINT "FailureClassification_ciRunId_fkey" FOREIGN KEY ("ciRunId") REFERENCES "CiRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureClassification" ADD CONSTRAINT "FailureClassification_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlakyTest" ADD CONSTRAINT "FlakyTest_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestSubscription" ADD CONSTRAINT "DigestSubscription_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
