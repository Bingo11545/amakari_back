import assert from 'node:assert';
import test from 'node:test';

const BASE_URL = 'http://localhost:5000/api';

test('Amakari End-to-End API Test Suite', async (t) => {
  let superAdminToken = '';
  let subAdminToken = '';
  let clientToken = '';
  let therapistToken = '';
  let createdSubAdminId = '';
  let createdAppointmentId = '';
  let createdSessionId = '';
  let pendingTherapistId = 'therapist_03';

  await t.test('1. Health Check', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
  });

  await t.test('2. Super Admin Login & Capabilities', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'superadmin@amakari.com', password: 'Admin123!' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.role, 'SUPER_ADMIN');
    superAdminToken = data.token;
    assert.ok(superAdminToken);
  });

  await t.test('3. Super Admin creates Sub Admin with specific permissions', async () => {
    const res = await fetch(`${BASE_URL}/admin/sub-admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Restricted Sub Admin',
        email: 'test_subadmin@amakari.com',
        password: 'Password123!',
        permissions: ['USER_VIEW', 'THERAPIST_VIEW', 'THERAPIST_APPROVE']
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    createdSubAdminId = data.subAdmin.id;
    assert.ok(createdSubAdminId);
    assert.deepStrictEqual(data.subAdmin.permissions, ['USER_VIEW', 'THERAPIST_VIEW', 'THERAPIST_APPROVE']);
  });

  await t.test('4. Sub Admin Login & Assigned Permission Access', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test_subadmin@amakari.com', password: 'Password123!' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.role, 'SUB_ADMIN');
    subAdminToken = data.token;

    // Allowed: USER_VIEW
    const userViewRes = await fetch(`${BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${subAdminToken}` }
    });
    assert.strictEqual(userViewRes.status, 200);

    // Allowed: THERAPIST_APPROVE
    const approveRes = await fetch(`${BASE_URL}/admin/therapists/${pendingTherapistId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${subAdminToken}` }
    });
    assert.strictEqual(approveRes.status, 200);
    const approveData = await approveRes.json();
    assert.strictEqual(approveData.therapist.status, 'verified');
  });

  await t.test('5. Sub Admin Security Check: Denied on unassigned permissions', async () => {
    // Sub admin does NOT have USER_DELETE permission
    const deleteRes = await fetch(`${BASE_URL}/admin/users/user_client_02`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${subAdminToken}` }
    });
    assert.strictEqual(deleteRes.status, 403);

    // Sub admin cannot create another Sub Admin (Super Admin only)
    const createSubRes = await fetch(`${BASE_URL}/admin/sub-admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${subAdminToken}`
      },
      body: JSON.stringify({
        name: 'Hacker Sub Admin',
        email: 'hacker@amakari.com',
        password: 'Password123!',
        permissions: ['USER_VIEW']
      })
    });
    assert.strictEqual(createSubRes.status, 403);
  });

  await t.test('6. Super Admin modifies Sub Admin permissions & disables', async () => {
    // Update permissions
    const updateRes = await fetch(`${BASE_URL}/admin/sub-admins/${createdSubAdminId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        permissions: ['USER_VIEW']
      })
    });
    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.deepStrictEqual(updateData.subAdmin.permissions, ['USER_VIEW']);

    // Toggle disable
    const toggleRes = await fetch(`${BASE_URL}/admin/sub-admins/${createdSubAdminId}/toggle`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert.strictEqual(toggleRes.status, 200);
    const toggleData = await toggleRes.json();
    assert.strictEqual(toggleData.subAdmin.status, 'DISABLED');
  });

  await t.test('7. Client / User Registration & Login', async () => {
    const uniqueEmail = `test_client_${Date.now()}@example.com`;
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John Doe',
        email: uniqueEmail,
        password: 'Password123!',
        role: 'USER'
      })
    });
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();
    clientToken = regData.token;
    assert.strictEqual(regData.user.role, 'USER');

    // Client cannot access Admin routes
    const adminCheckRes = await fetch(`${BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.strictEqual(adminCheckRes.status, 403);
  });

  await t.test('8. Client searches therapists & books appointment with conflict check', async () => {
    // Search therapists
    const listRes = await fetch(`${BASE_URL}/therapists?search=Anxiety`);
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.therapists.length > 0);

    const therapistId = 'therapist_01'; // Dr. Amara Reyes
    const testDate = '2026-10-15';

    // Book appointment 1: 10:00 - 10:50
    const bookRes1 = await fetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`
      },
      body: JSON.stringify({
        therapistId,
        date: testDate,
        startTime: '10:00',
        endTime: '10:50',
        type: 'Individual session',
        notes: 'Anxiety evaluation'
      })
    });
    assert.strictEqual(bookRes1.status, 201);
    const bookData1 = await bookRes1.json();
    createdAppointmentId = bookData1.appointment.id;
    createdSessionId = bookData1.session.id;
    assert.ok(createdAppointmentId);
    assert.ok(createdSessionId);

    // Book appointment 2 (CONFLICT! Overlaps 10:20 - 11:10)
    const bookConflictRes = await fetch(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`
      },
      body: JSON.stringify({
        therapistId,
        date: testDate,
        startTime: '10:20',
        endTime: '11:10',
        type: 'Individual session'
      })
    });
    assert.strictEqual(bookConflictRes.status, 409); // Conflict detected & prevented!
  });

  await t.test('9. Therapist Login & Management', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'therapist@amakari.com', password: 'Therapist123!' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.role, 'THERAPIST');
    therapistToken = data.token;

    // View my clients
    const clientsRes = await fetch(`${BASE_URL}/therapists/clients`, {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    assert.strictEqual(clientsRes.status, 200);

    // Update availability
    const availRes = await fetch(`${BASE_URL}/therapists/availability`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${therapistToken}`
      },
      body: JSON.stringify({
        availability: [
          { day: 'Monday', slots: ['09:00 - 10:00', '10:30 - 11:30'] },
          { day: 'Wednesday', slots: ['14:00 - 15:00'] }
        ]
      })
    });
    assert.strictEqual(availRes.status, 200);

    // Therapist cannot access Super Admin settings
    const settingsRes = await fetch(`${BASE_URL}/admin/settings`, {
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    assert.strictEqual(settingsRes.status, 403);
  });

  await t.test('10. Secure Session Join & End Flow', async () => {
    // Client joins session
    const joinResClient = await fetch(`${BASE_URL}/sessions/${createdSessionId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clientToken}` }
    });
    assert.strictEqual(joinResClient.status, 200);
    const joinDataClient = await joinResClient.json();
    assert.ok(joinDataClient.videoAccess.token);
    assert.strictEqual(joinDataClient.videoAccess.role, 'client');
    assert.strictEqual(joinDataClient.session.status, 'ACTIVE');

    // Therapist joins session
    const joinResTherapist = await fetch(`${BASE_URL}/sessions/${createdSessionId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    assert.strictEqual(joinResTherapist.status, 200);
    const joinDataTherapist = await joinResTherapist.json();
    assert.ok(joinDataTherapist.videoAccess.token);
    assert.strictEqual(joinDataTherapist.videoAccess.role, 'therapist');

    // Unauthorized outsider attempts to join -> 403 Forbidden!
    const outsiderLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'client2@amakari.com', password: 'Client123!' })
    });
    const outsiderData = await outsiderLogin.json();
    const joinOutsiderRes = await fetch(`${BASE_URL}/sessions/${createdSessionId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsiderData.token}` }
    });
    assert.strictEqual(joinOutsiderRes.status, 403);

    // Therapist ends session
    const endRes = await fetch(`${BASE_URL}/sessions/${createdSessionId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${therapistToken}` }
    });
    assert.strictEqual(endRes.status, 200);
    const endData = await endRes.json();
    assert.strictEqual(endData.session.status, 'ENDED');
  });

  await t.test('11. Audit Logs recorded', async () => {
    const logsRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert.strictEqual(logsRes.status, 200);
    const logsData = await logsRes.json();
    assert.ok(logsData.auditLogs.length > 0);
  });
});
