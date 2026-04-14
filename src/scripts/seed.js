const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create super admin
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new Error('INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set in the .env file');
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const superAdmin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        passwordHash,
        role: 'SUPER_ADMIN',
        businessId: null
      }
    });

    console.log('✅ Super admin created:', superAdmin.email);
    console.log('   Password:', adminPassword);
    console.log('   Login at: /internal/system/admin/login');

    console.log('\n🎉 Seeding complete!');
    console.log('\n📝 Login Credentials:');
    console.log(`   Super Admin: ${superAdmin.email} / ${adminPassword}`);

    // Seed WhatsApp Templates
    console.log('\n🌱 Seeding WhatsApp Templates...');
    const templates = [
      {
        name: 'rewple_review_request',
        twilioTemplateSid: 'HX83013900c5f1217f9be81a67055ea976',
        category: 'REVIEW_REQUEST',
        body: 'Hi {{1}} 👋\n\nThis is *{{2}}*.\n\nWe’d love to hear about your recent experience.\n\nYour feedback helps us improve and serve you better.\n\nShare your experience here:',
        buttonText: 'Leave Review',
        isGlobal: true,
        status: 'APPROVED'
      },
      {
        name: 'rewple_review_reminder',
        twilioTemplateSid: 'HX34d45fdef28516a1e64ff881d52f0e1f',
        category: 'REMINDER',
        body: 'Hi {{1}} 👋\n\nJust a quick reminder from *{{2}}*.\n\nWe’d really appreciate your feedback on your recent visit.\n\nYou can share it here:',
        buttonText: 'Leave Review',
        isGlobal: true,
        status: 'APPROVED'
      },
      {
        name: 'thank_you_positive',
        twilioTemplateSid: null,
        category: 'THANK_YOU_POSITIVE',
        body: 'Hi {{1}} 😊\n\nThank you for your feedback for *{{2}}*.\n\nWe truly appreciate your time and support.\n\nLooking forward to serving you again!',
        isGlobal: true,
        status: 'APPROVED'
      },
      {
        name: 'negative_feedback_ack',
        twilioTemplateSid: null,
        category: 'NEGATIVE_FEEDBACK_ACK',
        body: 'Hi {{1}},\n\nThank you for your feedback for *{{2}}*.\n\nWe’re sorry your experience wasn’t perfect. Your input helps us improve, and our team will look into this.\n\nWe appreciate your honesty.',
        isGlobal: true,
        status: 'APPROVED'
      }
    ];

    for (const template of templates) {
      await prisma.whatsAppTemplate.upsert({
        where: { name: template.name },
        update: template,
        create: template
      });
    }
    console.log('✅ WhatsApp Templates seeded!');
    
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
