<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { AdminUserPayload, User } from '../types';

const props = defineProps<{
  loading: boolean;
  openRoleMenu: string | null;
  text: Record<string, any>;
  users: User[];
}>();

const emit = defineEmits<{
  createAdminUser: [payload: AdminUserPayload];
  deleteUser: [user: User];
  toggleRoleMenu: [user: User];
  updateUserRole: [user: User, role: 'admin' | 'user'];
}>();

const isAdminModalOpen = ref(false);
const adminForm = reactive<AdminUserPayload>({
  username: '',
  email: '',
  password: '',
});

const labels = computed(() => {
  const isThai = props.text.language === 'TH';

  return {
    addAdmin: props.text.addAdmin || (isThai ? 'เพิ่มผู้ดูแล' : 'Add admin'),
    createAdmin: props.text.createAdmin || (isThai ? 'สร้างผู้ดูแล' : 'Create admin'),
    creatingAdmin: props.text.creatingAdmin || (isThai ? 'กำลังสร้าง...' : 'Creating...'),
    adminPassword: props.text.adminPassword || (isThai ? 'รหัสผ่านผู้ดูแล' : 'Admin password'),
    passwordHint: props.text.passwordHint || (isThai ? 'อย่างน้อย 6 ตัวอักษร' : 'At least 6 characters'),
  };
});

function resetAdminForm() {
  adminForm.username = '';
  adminForm.email = '';
  adminForm.password = '';
}

function openAdminModal() {
  resetAdminForm();
  isAdminModalOpen.value = true;
}

function closeAdminModal() {
  if (props.loading) return;
  isAdminModalOpen.value = false;
  resetAdminForm();
}

function submitAdmin() {
  emit('createAdminUser', {
    username: adminForm.username.trim(),
    email: adminForm.email.trim(),
    password: adminForm.password,
  });
  isAdminModalOpen.value = false;
  resetAdminForm();
}
</script>

<template>
  <div>
    <section class="panel">
      <div class="panel-heading">
        <div class="panel-title-group">
          <h2>{{ text.systemUsers }}</h2>
          <span>{{ users.length }} {{ text.usersCount }}</span>
        </div>
        <button class="primary-btn compact-btn" type="button" @click="openAdminModal">
          {{ labels.addAdmin }}
        </button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ text.usernameLabel }}</th>
              <th>{{ text.emailLabel }}</th>
              <th>{{ text.roleLabel }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user._id || user.username">
              <td>{{ user.username }}</td>
              <td>{{ user.email || '-' }}</td>
              <td>
                <div class="role-menu">
                  <span class="role-select" :aria-label="text.roleLabel">
                    {{ user.role === 'admin' ? text.adminRole : text.userRole }}
                  </span>
                </div>
              </td>
              <td class="actions">
                <button class="danger-link" @click="$emit('deleteUser', user)">{{ text.delete }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="isAdminModalOpen" class="modal-backdrop" @click.self="closeAdminModal">
      <section class="panel station-modal admin-user-modal">
        <div class="panel-heading">
          <h2>{{ labels.addAdmin }}</h2>
          <button class="secondary-btn compact-btn" type="button" :disabled="loading" @click="closeAdminModal">
            {{ text.cancel }}
          </button>
        </div>

        <form class="station-form" @submit.prevent="submitAdmin">
          <label>
            {{ text.usernameLabel }}
            <input v-model="adminForm.username" required autocomplete="off" :placeholder="text.usernamePlaceholder" />
          </label>
          <label>
            {{ text.emailLabel }}
            <input v-model="adminForm.email" required type="email" autocomplete="off" placeholder="admin@email.com" />
          </label>
          <label>
            {{ labels.adminPassword }}
            <input
              v-model="adminForm.password"
              required
              type="password"
              minlength="6"
              autocomplete="new-password"
              :placeholder="labels.passwordHint"
            />
          </label>

          <div class="form-actions">
            <button class="secondary-btn" type="button" :disabled="loading" @click="closeAdminModal">
              {{ text.cancel }}
            </button>
            <button class="primary-btn" type="submit" :disabled="loading">
              {{ loading ? labels.creatingAdmin : labels.createAdmin }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>
