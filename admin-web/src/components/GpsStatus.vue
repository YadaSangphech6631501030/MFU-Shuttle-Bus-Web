<script setup lang="ts">
import { computed } from 'vue';
import type { GpsStatus } from '../types';

const props = defineProps<{ status: GpsStatus | null; loadFailed: boolean; lang: 'th' | 'en' }>();
const message = computed(() => {
  const th = props.lang === 'th';
  if (props.loadFailed) return th ? 'โหลดข้อมูลรถไม่ได้ — ข้อมูลที่แสดงเป็นข้อมูลครั้งก่อน' : 'Unable to refresh buses — showing previously loaded data.';
  const state = props.status?.state;
  if (!state || state === 'connecting') return th ? 'กำลังเชื่อมต่อข้อมูลรถ…' : 'Connecting to vehicle data…';
  if (state === 'unconfigured') return th ? 'ยังไม่ได้เชื่อมต่อบัญชี GPS — กรุณาให้ผู้ดูแลระบบตั้งค่าบัญชี' : 'GPS account is not connected. Ask your system administrator to configure it.';
  if (state === 'disabled') return th ? 'ปิดการเชื่อมต่อ GPS อยู่' : 'GPS connection is disabled.';
  if (state === 'authentication_failed') return th ? 'เข้าสู่ระบบ GPS ไม่สำเร็จ — กรุณาตรวจสอบบัญชี' : 'GPS sign-in failed. Check the configured account.';
  if (state === 'connected') return th ? 'เชื่อมต่อแหล่งข้อมูล GPS แล้ว — ตรวจเวลาล่าสุดของรถแต่ละคันด้านล่าง' : 'GPS feed connected. Check the latest GPS time for each vehicle below.';
  if (state === 'empty_data') return th ? 'เว็บ GPS ไม่ส่งรายการรถกลับมา — ยังยืนยันสถานะรถไม่ได้' : 'GPS returned no vehicles. Vehicle status is unconfirmed.';
  if (['partial_data', 'invalid_data', 'invalid_response'].includes(state)) return th ? 'ข้อมูล GPS บางส่วนอ่านไม่ได้ — เก็บข้อมูลล่าสุดที่ตรวจสอบได้ไว้' : 'Some GPS data could not be read. Last validated positions are retained.';
  return th ? 'เชื่อมต่อข้อมูล GPS ไม่สำเร็จ — ยังยืนยันสถานะปัจจุบันของรถไม่ได้' : 'GPS feed is unavailable. Current vehicle status is unconfirmed.';
});
const lastSync = computed(() => props.status?.lastSuccessAt
  ? new Date(props.status.lastSuccessAt).toLocaleString(props.lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok' }) : null);
</script>

<template>
  <div class="gps-notice" :class="{ 'gps-notice-ok': status?.healthy && !loadFailed }" role="status">
    <strong>{{ message }}</strong>
    <small v-if="lastSync">{{ lang === 'th' ? 'ดึงข้อมูลสำเร็จล่าสุด' : 'Last successful fetch' }}: {{ lastSync }} (UTC+7)</small>
    <small v-if="status?.unmappedCount">{{ lang === 'th' ? 'อุปกรณ์ที่ยังไม่ผูกกับทะเบียนรถ' : 'Devices not linked to this fleet' }}: {{ status.unmappedCount }}</small>
  </div>
</template>

<style scoped>
.gps-notice { display: grid; gap: 6px; padding: 14px 16px; margin-bottom: 18px; border: 1px solid #e6cb8d; border-radius: 10px; background: #fff9eb; color: #755315; line-height: 1.6; }
.gps-notice-ok { border-color: #b8dbcc; background: #f1faf5; color: #246449; }
.gps-notice strong { font-size: 14px; font-weight: 600; }
.gps-notice small { font-size: 12px; }
</style>
