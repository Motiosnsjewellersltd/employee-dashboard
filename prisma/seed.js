const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const username = String(process.env.ADMIN_USERNAME || '').trim();
  const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();

  if (!username || !adminPassword) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be set before running db:seed.');
  }
  if (adminPassword.length < 10) {
    throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  }

  const password = await bcrypt.hash(adminPassword, 12);
  await prisma.employee.upsert({
    where: { mobile: username },
    update: { password, role: 'ADMIN', status: 'ACTIVE', deletedAt: null, deletedById: null, deletedByName: null },
    create: {
      name: 'Admin',
      mobile: username,
      password,
      role: 'ADMIN',
      designation: 'Admin',
      department: 'Admin',
      status: 'ACTIVE'
    }
  });
  console.log(`Admin login created/updated for: ${username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
