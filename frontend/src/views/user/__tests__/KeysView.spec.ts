import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import KeysView from '../KeysView.vue'

const {
  create,
  update,
  list,
  toggleStatus,
  deleteKey,
  getDashboardApiKeysUsage,
  getAvailable,
  getUserGroupRates,
  getPublicSettings,
  showError,
  showSuccess,
  showInfo,
  nextStep,
  isCurrentStep,
  copyToClipboard,
} = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  toggleStatus: vi.fn(),
  deleteKey: vi.fn(),
  getDashboardApiKeysUsage: vi.fn(),
  getAvailable: vi.fn(),
  getUserGroupRates: vi.fn(),
  getPublicSettings: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showInfo: vi.fn(),
  nextStep: vi.fn(),
  isCurrentStep: vi.fn(() => false),
  copyToClipboard: vi.fn(),
}))

vi.mock('@/api', () => ({
  keysAPI: {
    create,
    update,
    list,
    toggleStatus,
    delete: deleteKey,
  },
  usageAPI: {
    getDashboardApiKeysUsage,
  },
  userGroupsAPI: {
    getAvailable,
    getUserGroupRates,
  },
  authAPI: {
    getPublicSettings,
  },
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    showError,
    showSuccess,
    showInfo,
  }),
}))

vi.mock('@/stores/onboarding', () => ({
  useOnboardingStore: () => ({
    isCurrentStep,
    nextStep,
  }),
}))

vi.mock('@/composables/useClipboard', () => ({
  useClipboard: () => ({
    copyToClipboard,
  }),
}))

vi.mock('@/composables/usePersistedPageSize', () => ({
  getPersistedPageSize: () => 10,
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  }
})

const AppLayoutStub = { template: '<div><slot /></div>' }
const TablePageLayoutStub = {
  template: '<div><slot name="actions" /><slot name="filters" /><slot name="table" /></div>',
}

const defaultPublicSettings = {
  registration_enabled: true,
  email_verify_enabled: false,
  registration_email_suffix_whitelist: [],
  promo_code_enabled: false,
  password_reset_enabled: false,
  invitation_code_enabled: false,
  turnstile_enabled: false,
  turnstile_site_key: '',
  site_name: 'Test',
  site_logo: '',
  site_subtitle: '',
  api_base_url: '',
  contact_info: '',
  doc_url: '',
  home_content: '',
  hide_ccs_import_button: false,
  payment_enabled: false,
  table_default_page_size: 10,
  table_page_size_options: [10],
  custom_menu_items: [],
  custom_endpoints: [],
  linuxdo_oauth_enabled: false,
  oidc_oauth_enabled: false,
  oidc_oauth_provider_name: '',
  backend_mode_enabled: false,
  version: 'test',
}

function formatLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function mountView() {
  return mount(KeysView, {
    global: {
      stubs: {
        AppLayout: AppLayoutStub,
        TablePageLayout: TablePageLayoutStub,
        DataTable: true,
        Pagination: true,
        BaseDialog: true,
        ConfirmDialog: true,
        EmptyState: true,
        Select: true,
        SearchInput: true,
        Icon: true,
        UseKeyModal: true,
        EndpointPopover: true,
        GroupBadge: true,
        GroupOptionItem: true,
        Teleport: true,
      },
    },
  })
}

describe('KeysView expiration behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))

    create.mockReset()
    update.mockReset()
    list.mockReset()
    toggleStatus.mockReset()
    deleteKey.mockReset()
    getDashboardApiKeysUsage.mockReset()
    getAvailable.mockReset()
    getUserGroupRates.mockReset()
    getPublicSettings.mockReset()
    showError.mockReset()
    showSuccess.mockReset()
    showInfo.mockReset()
    nextStep.mockReset()
    isCurrentStep.mockReset()
    copyToClipboard.mockReset()

    create.mockResolvedValue({})
    update.mockResolvedValue({})
    list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
      pages: 0,
    })
    getAvailable.mockResolvedValue([])
    getUserGroupRates.mockResolvedValue({})
    getPublicSettings.mockResolvedValue(defaultPublicSettings)
    getDashboardApiKeysUsage.mockResolvedValue({ stats: {} })
    isCurrentStep.mockReturnValue(false)
  })

  it('submits exact expires_at when creating a key with a custom expiration', async () => {
    const wrapper = mountView()
    await flushPromises()

    const setupState = (wrapper.vm as any).$?.setupState
    const customExpiry = new Date(Date.now() + 5 * 60 * 1000)

    setupState.formData.name = 'Temporary key'
    setupState.formData.group_id = 1
    setupState.formData.enable_expiration = true
    setupState.formData.expiration_preset = 'custom'
    setupState.formData.expiration_date = formatLocalInput(customExpiry)

    await setupState.handleSubmit()

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Temporary key',
      group_id: 1,
      expires_at: customExpiry.toISOString(),
    }))
  })

  it('adds preset days on top of the current expiration in edit mode', async () => {
    const wrapper = mountView()
    await flushPromises()

    const setupState = (wrapper.vm as any).$?.setupState
    const initialExpiry = new Date('2025-01-10T12:00:00Z')

    setupState.editKey({
      id: 42,
      user_id: 1,
      key: 'sk_existing_key_123456',
      name: 'Existing key',
      group_id: 1,
      status: 'active',
      ip_whitelist: [],
      ip_blacklist: [],
      last_used_at: null,
      quota: 0,
      quota_used: 0,
      expires_at: initialExpiry.toISOString(),
      created_at: initialExpiry.toISOString(),
      updated_at: initialExpiry.toISOString(),
      rate_limit_5h: 0,
      rate_limit_1d: 0,
      rate_limit_7d: 0,
      usage_5h: 0,
      usage_1d: 0,
      usage_7d: 0,
      window_5h_start: null,
      window_1d_start: null,
      window_7d_start: null,
      reset_5h_at: null,
      reset_1d_at: null,
      reset_7d_at: null,
    })

    setupState.setExpirationDays(7)
    expect(new Date(setupState.formData.expiration_date).toISOString()).toBe(
      new Date(initialExpiry.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    )

    setupState.setExpirationDays(30)
    expect(new Date(setupState.formData.expiration_date).toISOString()).toBe(
      new Date(initialExpiry.getTime() + 37 * 24 * 60 * 60 * 1000).toISOString()
    )
  })
})
