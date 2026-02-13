const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create super admin
    const passwordHash = await bcrypt.hash('admin123', 10);

    const superAdmin = await prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        email: 'admin@example.com',
        passwordHash,
        role: 'SUPER_ADMIN',
        businessId: null
      }
    });

    console.log('✅ Super admin created:', superAdmin.email);
    console.log('   Password: admin123');
    console.log('   Login at: http://localhost:3000/admin/login');

    // Create a demo business
    const demoBusiness = await prisma.business.upsert({
      where: { slug: 'demo-clinic' },
      update: {},
      create: {
        name: 'Demo Dental Clinic',
        slug: 'demo-clinic',
        reviewLink: 'https://g.page/demo-dental-clinic',
        messageTemplate: 'Hi {{name}}, thank you for visiting {{business_name}}! Please share your feedback: {{link}}',
        reminderTemplate: 'Hi {{name}}, we noticed you haven\'t shared your feedback yet. It would mean a lot to us: {{link}}',
        sendDelayHours: 3,
        reminderDelayHours: 24,
        maxReminders: 2,
        status: 'ACTIVE',
        smsMonthlyLimit: 500,
        maxCsvRowsPerUpload: 300,
        rateLimitPerMinute: 20
      }
    });

    console.log('✅ Demo business created:', demoBusiness.name);

    // Create demo business admin
    const demoAdminPassword = await bcrypt.hash('demo123', 10);
    
    const demoAdmin = await prisma.user.upsert({
      where: { email: 'demo@clinic.com' },
      update: {},
      create: {
        email: 'demo@clinic.com',
        passwordHash: demoAdminPassword,
        role: 'BUSINESS_ADMIN',
        businessId: demoBusiness.id
      }
    });

    console.log('✅ Demo business admin created:', demoAdmin.email);
    console.log('   Password: demo123');
    console.log('   Login at: http://localhost:3000/b/demo-clinic/login');

    // Create sample patients
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await prisma.patient.createMany({
      data: [
        {
          businessId: demoBusiness.id,
          name: 'John Doe',
          phone: '+1234567890',
          visitDate: yesterday,
          sendAt: new Date(yesterday.getTime() + 3 * 60 * 60 * 1000),
          source: 'MANUAL'
        },
        {
          businessId: demoBusiness.id,
          name: 'Jane Smith',
          phone: '+1987654321',
          visitDate: yesterday,
          sendAt: new Date(yesterday.getTime() + 3 * 60 * 60 * 1000),
          sentAt: new Date(yesterday.getTime() + 3.5 * 60 * 60 * 1000),
          rating: 5,
          submittedAt: new Date(yesterday.getTime() + 4 * 60 * 60 * 1000),
          feedback: 'Great service! Very professional and friendly staff.',
          source: 'MANUAL'
        },
        {
          businessId: demoBusiness.id,
          name: 'Bob Johnson',
          visitDate: tomorrow,
          sendAt: new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000),
          source: 'MANUAL'
        }
      ]
    });

    console.log('✅ Sample patients created');

    console.log('\n🎉 Seeding complete!');
    console.log('\n📝 Login Credentials:');
    console.log('   Super Admin: admin@example.com / admin123');
    console.log('   Demo Business: demo@clinic.com / demo123');
    
  } catch (error) {
    console.error('❌ Seeding error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
