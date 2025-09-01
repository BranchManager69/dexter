-- CreateTable
CREATE TABLE "token_config" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "total_supply" BIGINT NOT NULL,
    "initial_circulating" BIGINT NOT NULL,
    "community_allocation_percent" INTEGER NOT NULL,
    "team_allocation_percent" INTEGER NOT NULL,
    "treasury_allocation_percent" INTEGER NOT NULL,
    "initial_price" DECIMAL(20,10) NOT NULL,
    "launch_method" VARCHAR(50) NOT NULL,

    CONSTRAINT "token_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_phases" (
    "id" SERIAL NOT NULL,
    "quarter_number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "title" VARCHAR(100) NOT NULL,

    CONSTRAINT "roadmap_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_tasks" (
    "id" SERIAL NOT NULL,
    "phase_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "roadmap_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_stats" (
    "id" SERIAL NOT NULL,
    "user_count" INTEGER NOT NULL DEFAULT 0,
    "upcoming_contests" INTEGER NOT NULL DEFAULT 0,
    "total_prize_pool" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "waitlist_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_commands" (
    "id" SERIAL NOT NULL,
    "command_name" VARCHAR(50) NOT NULL,
    "command_response" TEXT NOT NULL,

    CONSTRAINT "terminal_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terminal_commands_command_name_key" ON "terminal_commands"("command_name");

-- AddForeignKey
ALTER TABLE "roadmap_tasks" ADD CONSTRAINT "roadmap_tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "roadmap_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
