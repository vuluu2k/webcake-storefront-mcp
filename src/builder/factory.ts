// Ported verbatim from builderx_spa/src/common/factory.js — the source of truth for
// BuilderX page component nodes. Only the two original imports (lodash + ./index.js)
// are replaced by the local shims below so this runs standalone inside the MCP.
const cloneDeep = (o: any) => structuredClone(o);
const get = (obj: any, path: string[], dflt?: any) => {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return dflt;
    cur = cur[k];
  }
  return cur === undefined ? dflt : cur;
};
export const randomString = (length: number) =>
  [...Array(length)].map(() => (~~(Math.random() * 36)).toString(36)).join('');

const SKELETON = {
  id: '',
  name: '',
  type: '',
  specials: {},
  runtime: {}
}

export const createSection = () => {
  const section = cloneDeep(SKELETON)

  section.id = 'SECTION-' + randomString(8)
  section.type = 'section'

  section.children = []

  return section
}

export const createText = (opts: any = {}) => {
  const text = cloneDeep(SKELETON)

  text.id = 'TEXT-' + randomString(8)
  text.type = 'text'

  text.specials.text = opts.text || 'Add a heading'
  text.specials = { ...text.specials, ...opts.specials }

  text.runtime.style = {
    width: 230,
    height: 44,
    color: '#000000',
    ...opts.style,
  }

  text.runtime.config = {
    ...(opts.config || {}),
    heightUnit: 'auto'
  }

  if (Object.prototype.hasOwnProperty.call(opts, 'top')) text.runtime.style.top = opts.top
  if (Object.prototype.hasOwnProperty.call(opts, 'left')) text.runtime.style.left = opts.left

  if (opts.breakpoint) {
    buildElementWithBreakpoint(text, opts.breakpoint)
  }

  return text
}

export const createLine = (opts: any = {}) => {
  const line = cloneDeep(SKELETON)

  line.id = `LINE-${randomString(8)}`
  line.type = 'line'
  line.runtime.style = {
    width: opts.width || 245,
    ...(opts.style || {}),
  }

  line.runtime.config = {
    ...(opts.config || {})
  }

  line.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(line, opts.breakpoint)
  }

  return line
}

export const createRectangle = (opts: any = {}) => {
  const rect = cloneDeep(SKELETON)

  rect.id = 'RECT-' + randomString(8)
  rect.type = 'rectangle'

  rect.runtime.style = {
    width: opts.width || 100,
    height: opts.height || 100,
    background: opts.background || 'rgba(160, 162, 164, 1)',
    ...opts.style,
  }

  if (opts.bindings) rect.bindings = opts.bindings || []

  if (opts.mask) rect.runtime.config = { mask: opts.mask, maskId: opts.maskId }

  if (opts.config) rect.runtime.config = {
    ...rect.runtime.config,
    ...opts.config
  }

  if (opts.events) rect.events = opts.events || []

  return rect
}

export const createImage = (opts: any = {}) => {
  const image = cloneDeep(SKELETON)

  image.id = 'IMAGE-' + randomString(8)
  image.type = 'image'

  image.runtime.style = {
    ...(opts.style || {}),
    width: opts.width || 300,
    height: opts.height || 200,
  }

  image.runtime.config = {
    heightUnit: 'auto',
    ...(opts.config || {})
  }

  if (opts.top) image.runtime.style.top = opts.top
  if (opts.left) image.runtime.style.left = opts.left

  if (opts.src) image.runtime.config.src = opts.src

  return image
}

export const createVideo = (opts: any = {}) => {
  const video = cloneDeep(SKELETON)

  video.id = 'VIDEO-' + randomString(8)
  video.type = 'video'

  video.runtime.style = {
    width: 350,
    height: 200
  }

  if (opts.top) video.runtime.style.top = opts.top
  if (opts.left) video.runtime.style.left = opts.left

  video.specials.src = opts.src || 'https://video-public.canva.com/VADbyHzfXOU/videos/061f7ce036.mp4'
  video.specials.thumbnail = opts.thumbnail || 'https://video-public.canva.com/VADbyHzfXOU/v/915b8706ad.jpg'
  video.specials.time = opts.time || '10.0s'
  video.specials.type = 'store'

  return video
}

export const createButton = (opts: any = {}) => {
  const button = cloneDeep(SKELETON)

  button.id = 'BUTTON-' + randomString(8)
  button.type = 'button'

  button.runtime.style = {
    width: 142,
    height: 46,
    fontSize: '16px',
    ...(opts.style || {}),
  }

  button.runtime.config = {
    ...(opts.config || {})
  }

  button.specials.text = opts.text || 'Button'

  if (opts.events) button.events = opts.events

  delete button.runtime.style['text']

  if (opts.breakpoint) {
    buildElementWithBreakpoint(button, opts.breakpoint)
  }

  return button
}

export const createContainer = (opts: any = {}) => {
  const container = cloneDeep(SKELETON)

  container.id = 'CONTAINER-' + randomString(8)
  container.type = 'container'

  container.children = opts.children || []

  container.style = { ...(opts.style || {}) }

  if (opts.runtime) container.runtime = opts.runtime || {}

  return container
}

export const createCarousel = (opts: any = {}) => {
  const carousel = cloneDeep(SKELETON)

  carousel.id = 'CAROUSEL-' + randomString(8)
  carousel.type = 'carousel'

  carousel.children = opts.children || []

  carousel.runtime.style = {
    width: opts.width || 750,
    height: opts.height || 250
  }

  carousel.runtime.config = {
    grid: '3x1',
    columns: [{ unit: 'fr', value: 1 }, { unit: 'fr', value: 1 }, { unit: 'fr', value: 1 }],
    rows: [
      {
        unit: 'min/max',
        min: {
          unit: 'px',
          absValue: 250
        },
        max: {
          unit: 'max-c'
        }
      }
    ],
    slideWidth: opts.slideWidth || 250,
    slideItems: opts.slideItems || 3,
    heightUnit: 'auto',
    ...opts.config
  }

  return carousel
}

export const createGallery = (opts: any = {}) => {
  const gallery = cloneDeep(SKELETON)

  gallery.id = 'GALLERY-' + randomString(8)
  gallery.type = 'gallery'
  gallery.runtime.style = {
    ...opts.style,
    width: opts.width || 500,
    height: opts.height || 300,
  }
  // gallery.specials.showThumbnail = opts.showThumbnail
  // gallery.specials.showNavigation = opts.showNavigation
  gallery.specials.media = opts.media || []

  gallery.runtime.config = {
    heightUnit: 'auto',
    showThumbnail: opts.showThumbnail,
    showNavigation: opts.showNavigation,
    thumbnailPosition: opts.thumbnailPosition || "none",
  }

  // if (opts.thumbnailPosition) gallery.specials.thumbnailPosition = opts.thumbnailPosition

  return gallery
}

export const createSwiper = (opts: any = {}) => {
  const swiper = cloneDeep(SKELETON)

  swiper.id = 'SWIPER-' + randomString(8)
  swiper.type = 'swiper'
  swiper.runtime.style = {
    ...opts.style,
    width: opts.width || 500,
    height: opts.height || 300,
  }

  swiper.runtime.config = {
    ...(opts.config || {}),
    heightUnit: 'auto'
  }

  return swiper
}

export const createSlide = (opts: any = {}) => {
  const slide = cloneDeep(SKELETON)
  
  slide.id = 'SLIDE-' + randomString(8)
  slide.type = 'slide'
  slide.runtime.style = {
    ...opts.style,
    width: opts.width || 500,
    height: opts.height || 300,
  }

  slide.runtime.config = {
    heightUnit: 'auto',
    widthUnit: 'auto',
    grid: '1x1',
    columns: [{ unit: 'fr', value: 1 }],
    rows: [{ unit: 'min/max', min: { unit: 'px', absValue: 300 }, max: { unit: 'max-c' }}],
  }

  slide.children = [
    ...opts.children
  ]

  if (opts.extra) {
    Object.keys(opts.extra)?.forEach((key) => {
      slide[key] = opts.extra[key]
    })
  }

  return slide
}

export const createGoogleMap = (opts: any = {}) => {
  const googlemap = cloneDeep(SKELETON)

  googlemap.id = 'GOOGLEMAP-' + randomString(8)
  googlemap.type = 'googlemap'

  googlemap.specials.iframe = opts.iframe
  googlemap.runtime.style = {
    width: opts.width || 500,
    height: opts.height || 300
  }

  return googlemap
}

export const createMenu = (opts: any = {}) => {
  const menu = cloneDeep(SKELETON)

  menu.id = 'MENU-' + randomString(8)
  menu.type = 'menu'

  menu.runtime.style = { ...opts.style }
  menu.runtime.config = { ...opts.config }
  menu.specials = opts.specials || {}

  if (opts.children) menu.children = opts.children || []

  return menu
}

export const createCountDown = (opts: any = {}) => {
  const countdown = cloneDeep(SKELETON)

  countdown.id = 'COUNTDOWN-' + randomString(8)
  countdown.type = 'countdown'
  countdown.runtime.style = { ...opts.style }
  countdown.runtime.config = { ...opts.config }
  countdown.specials = { ...opts.specials }

  return countdown
}

export const createEmbed = (opts: any = {}) => {
  const embed = cloneDeep(SKELETON)

  embed.id = 'EMBED-' + randomString(8)
  embed.type = 'embed'
  embed.specials = { ...opts.specials }
  embed.runtime.style = { ...opts.style }
  embed.runtime.style = {
    width: opts.width || 470,
    height: opts.height || 270
  }

  return embed
}

export const createNotify = (opts: any = {}) => {
  const notify = cloneDeep(SKELETON)

  notify.id = 'NOTIFY-' + randomString(8)
  notify.type = 'notify'
  notify.specials = { ...opts.specials }
  notify.runtime.style = { ...opts.style }
  notify.runtime.config = { ...opts.config }
  if (opts.children) notify.children = opts.children || []

  return notify
}
export const createForm = (opts: any = {}) => {
  const form = cloneDeep(SKELETON)
  form.id = 'FORM-' + randomString(8)
  form.type = 'form'

  form.children = opts.children || []
  form.runtime.style = { ...opts.style }
  form.runtime.config = { ...opts.config }
  form.specials = { ...opts.specials }

  return form
}

export const createInput = (opts: any = {}) => {
  const input = cloneDeep(SKELETON)
  input.id = 'INPUT-' + randomString(8)
  input.type = 'input'
  input.runtime.config = { ...opts.config }
  input.runtime.style = { ...opts.style }
  input.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(input, opts.breakpoint)
  }
  return input
}

export const createInputProductNote = (opts: any = {}) => {
  const input = cloneDeep(SKELETON)
  input.id = 'INPUT-PRODUCT-NOTE' + randomString(8)
  input.type = 'input-product-note'
  input.runtime.config = { ...opts.config }
  input.runtime.style = { ...opts.style }
  input.specials = { ...opts.specials }
  return input
}

export const createTextArea = (opts: any = {}) => {
  const textArea = cloneDeep(SKELETON)
  textArea.id = 'TEXTAREA-' + randomString(8)
  textArea.type = 'text-area'
  textArea.runtime.config = { ...opts.config }
  textArea.runtime.style = { ...opts.style }
  textArea.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(textArea, opts.breakpoint)
  }
  return textArea
}

export const buildElementWithBreakpoint = (el: any, breakpoint: string) => {
  const customStyle = get(el, ['runtime', 'style'], {})
  el[breakpoint] = { style: {}, config: {} }
  el[breakpoint].style = Object.assign({}, el[breakpoint].style, customStyle)

  const customConfig = get(el, ['runtime', 'config'], {})
  el[breakpoint].config = Object.assign({}, el[breakpoint].config, customConfig)
  el[breakpoint].config.loaded = true

  const customSpecials = get(el, ['runtime', 'specials'], {})
  el.specials = Object.assign({}, el.specials || {}, customSpecials)

  delete el.runtime
}

// grid-product card self-renders image + name + price. The defaults below are the keys that
// are near-UNIVERSAL across real designer templates (surveyed 5 industries — fashion/kids/
// cosmetics/food/electronics): bold price, responsive collapse, show original/discount price,
// a neutral square image + medium gaps. INDUSTRY-DEPENDENT keys (image_ratio 4/5|2/3|3/4|1/1,
// font family/size, column count, exact gaps, productNameColor/productPriceColor) are
// intentionally NOT forced here — the caller / template sets them. Override via opts.config /
// opts.specials.
export const createGridProduct = (opts: any = {}) => {
  const product = cloneDeep(SKELETON)

  product.id = 'GRID-PRODUCT-' + randomString(8)
  product.type = 'grid-product'

  product.runtime.style = {
    width: opts.width,
    height: 354,
    ...(opts.style || {})
  }

  product.runtime.config = {
    columns: 4,
    image_ratio: '1/1',
    img_object_fit: 'cover',
    gap_column: 24,
    gap_row: 24,
    product_info_padding_y: 12,
    price_padding_y: 5,
    productPriceFontWeight: 'bold',
    responsive: 'custom',
    heightUnit: 'auto',
    ...(opts.config || {})
  }

  product.specials = {
    element_async: true,
    products_per_load: 12,
    show_original_price: true,
    show_discount_on_price: true,
    show_quick_view: false,
    ...(opts.specials || {})
  }

  return product
}

export const createSliderProduct = (opts: any = {}) => {
  const product = cloneDeep(SKELETON)

  product.id = 'SLIDER-PRODUCT-' + randomString(8)
  product.type = 'slider-product'

  product.runtime.style = { width: opts.width, height: 353.22 }
  product.runtime.config = { responsive: opts.responsive, heightUnit: 'auto' }

  return product
}

export const createInputSearch = (opts: any = {}) => {
  const inputSearch = cloneDeep(SKELETON)

  inputSearch.id = 'INPUT-SEARCH-' + randomString(8)
  inputSearch.type = 'input-search'

  inputSearch.runtime.style = { ...opts.style }
  inputSearch.runtime.config = opts.config || {}
  inputSearch.specials = { ...opts.specials }

  return inputSearch
}

export const createMenuItem = (opts: any = {}) => {
  const menuItem = cloneDeep(SKELETON)

  menuItem.id = 'MENU-ITEM-' + randomString(8)
  menuItem.type = 'menu-item'

  menuItem.specials = opts.specials || {}
  menuItem.children = opts.children || []
  menuItem.runtime.style = { ...opts.style }
  menuItem.runtime.config = { ...opts.config }

  return menuItem
}

export const createMenuAnchorItem = (opts: any = {}) => {
  const menuItem = cloneDeep(SKELETON)

  menuItem.id = 'MENU-ANCHOR-ITEM-' + randomString(8)
  menuItem.type = 'menu-anchor-item'

  menuItem.specials = opts.specials || {}
  menuItem.children = opts.children || []
  menuItem.runtime.style = { ...opts.style }
  menuItem.runtime.config = { ...opts.config }

  return menuItem
}

export const createSubmenu = (opts: any = {}) => {
  const submenu = cloneDeep(SKELETON)

  submenu.id = 'SUBMENU-' + randomString(8)
  submenu.type = 'submenu'

  submenu.specials = { ...opts }
  submenu.children = opts.children || []

  return submenu
}

export const createMenuDroppable = (opts: any = {}) => {
  const menuDroppable = cloneDeep(SKELETON)

  menuDroppable.id = 'MENU-DROPPABLE-' + randomString(8)
  menuDroppable.type = 'menu-droppable'

  menuDroppable.children = opts.children || []

  return menuDroppable
}

export const createRow = () => {
  const row = cloneDeep(SKELETON)

  row.id = 'ROW-' + randomString(8)
  row.type = 'row'

  return row
}

export const createMemberBar = (opts: any = {}) => {
  const menuBar = cloneDeep(SKELETON)

  menuBar.id = 'MEMBER-BAR-' + randomString(8)
  menuBar.type = 'member-bar'
  menuBar.runtime.style = { ...opts.style }
  menuBar.runtime.config = { ...opts.config }

  menuBar.specials = { ...opts.specials }

  return menuBar
}

// Default shopping-bag icon (real prod template svg, 28×28, fill=currentColor so it
// inherits the element's colour). Used when a caller doesn't supply its own svg, so a
// header cart-icon is never blank.
const DEFAULT_CART_SVG = '<svg width="100%" height="100%" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.0166 3.76758C10.2864 3.76758 7.38924 7.04233 7.38924 10.9179C7.38924 10.9179 7.38924 10.9179 7.38924 10.918H4.94829C4.21457 10.918 3.66298 11.5872 3.8031 12.3074L5.89025 23.0355C6.10354 24.1318 7.06378 24.9232 8.18064 24.9232H19.8444C20.9613 24.9232 21.9215 24.1318 22.1348 23.0355L24.2219 12.3074C24.3621 11.5872 23.8105 10.918 23.0767 10.918H20.644C20.644 10.9179 20.644 10.9179 20.644 10.9179C20.644 7.04233 17.7468 3.76758 14.0166 3.76758ZM18.894 10.918C18.894 10.9179 18.894 10.9179 18.894 10.9179C18.894 7.86235 16.6401 5.51758 14.0166 5.51758C11.3931 5.51758 9.13924 7.86235 9.13924 10.9179C9.13924 10.9179 9.13924 10.9179 9.13924 10.918H18.894ZM7.60804 22.7013L5.65605 12.668H22.369L20.417 22.7013C20.3637 22.9754 20.1236 23.1732 19.8444 23.1732H8.18064C7.90143 23.1732 7.66137 22.9754 7.60804 22.7013Z" fill="currentColor"></path></svg>'

export const createCartIcon = ({ svg, itemCount, config, style, children }: any = {}) => {
  const cart = cloneDeep(SKELETON)

  cart.id = 'CART-ICON-' + randomString(8)
  cart.type = 'cart-icon'

  cart.runtime.config = {
    itemCountFontFamily: 'Roboto',
    itemCountFontSize: '11px',
    itemCountColor: 'white',
    itemCountBorderRadius: '50%',
    ...config
  }
  cart.runtime.style = {
    width: 24,
    height: 24,
    ...(style || {})
  }

  cart.specials.svg = svg || DEFAULT_CART_SVG
  cart.specials.itemCount = itemCount ?? 0

  if (children) cart.children = children || []

  return cart
}

export const createWishlist = ({ svg, itemCount, config, children, style }: any = {}) => {
  const wistlist = cloneDeep(SKELETON)

  wistlist.id = 'WISHLIST-' + randomString(8)
  wistlist.type = 'wishlist'

  wistlist.runtime.config = { ...config }
  wistlist.runtime.style = {
    width: 24,
    height: 24,
    ...style,
  }

  wistlist.specials.svg = svg
  wistlist.specials.itemCount = itemCount

  if (children) wistlist.children = children || []

  return wistlist
}

export const createFavoriteIcon = (opts: any = {}) => {
  const favorite = cloneDeep(SKELETON)

  favorite.id = 'FAVORITE-ICON-' + randomString(8)
  favorite.type = 'favorite-icon'

  favorite.runtime.style = {
    width: opts.width || 25,
    height: opts.height || 25,
    background: '#ffffff00',
    ...opts.style,
  }

  if (opts.mask) favorite.runtime.config = { mask: opts.mask }

  if (opts.config) favorite.runtime.config = {
    ...favorite.runtime.config,
    ...opts.config
  }

  if (opts.events) favorite.events = opts.events || []

  return favorite
}

export const createCheckbox = (opts: any = {}) => {
  const checkbox = cloneDeep(SKELETON)
  checkbox.id = 'CHECKBOX-' + randomString(8)
  checkbox.type = 'checkbox'
  checkbox.runtime.config = { ...opts.config }
  checkbox.runtime.style = { ...opts.style }
  checkbox.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(checkbox, opts.breakpoint)
  }

  return checkbox
}

export const createAddress = (opts: any = {}) => {
  const address = cloneDeep(SKELETON)
  address.id = 'ADDRESS-' + randomString(8)
  address.type = 'address'
  address.runtime.config = { ...opts.config }
  address.runtime.style = { ...opts.style }
  address.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(address, opts.breakpoint)
  }

  return address
}

export const createRadio = (opts: any = {}) => {
  const radio = cloneDeep(SKELETON)
  radio.id = 'RADIO-' + randomString(8)
  radio.type = 'radio'
  radio.runtime.config = { ...opts.config }
  radio.runtime.style = { ...opts.style }
  radio.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(radio, opts.breakpoint)
  }

  return radio
}

export const createSelect = (opts: any = {}) => {
  const select = cloneDeep(SKELETON)
  select.id = 'SELECT-' + randomString(8)
  select.type = 'select'
  select.runtime.config = { ...opts.config }
  select.runtime.style = { ...opts.style }
  select.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(select, opts.breakpoint)
  }

  return select
}

export const createGroupSelect = (opts: any = {}) => {
  const select = cloneDeep(SKELETON)
  select.id = 'GROUP-SELECT-' + randomString(8)
  select.type = 'group-select'
  select.runtime.config = { ...opts.config }
  select.runtime.style = { ...opts.style }
  select.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(select, opts.breakpoint)
  }

  return select
}

export const createProductGallery = (opts: any = {}) => {
  const gallery = cloneDeep(SKELETON)

  gallery.id = 'PRODUCT-GALLERY-' + randomString(8)
  gallery.type = 'product-gallery'

  gallery.runtime.style = opts.style || {}
  gallery.runtime.config = {
    sizeThumbnail: { width: 580, height: 580 },
    heightUnit: 'auto',
    ...(opts.config || {})
  }

  return gallery
}

export const createProductImagesCarousel = (opts: any = {}) => {
  const slider = cloneDeep(SKELETON)
  
  slider.id = 'PD-IMG-CAROUSEL-'
  slider.type = 'product-image-carousel'

  slider.runtime.style = opts.style || {}
  slider.runtime.config = opts.config || {}

  return slider
}

export const createRectangleDataset = (opts: any = {}) => {
  const rectangle = cloneDeep(SKELETON)

  rectangle.id = 'RECTANGLE-DATASET-' + randomString(8)
  rectangle.type = 'rectangle-dataset'

  rectangle.runtime.style = {
    width: 200,
    height: 200,
    ...(opts.style || {})
  }

  rectangle.runtime.config = {
    ...(opts.config || {})
  }

  if (opts.bindings) rectangle.bindings = opts.bindings || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(rectangle, opts.breakpoint)
  }

  return rectangle
}

export const createTextDataset = (opts: any = {}) => {
  const textDataset = cloneDeep(SKELETON)

  textDataset.id = 'TEXT-DATASET-' + randomString(8)
  textDataset.type = 'text-dataset'

  textDataset.runtime.style = {
    width: 200,
    height: 26.7,
    fontSize: '16px',
    color: 'rgba(0, 0, 0, 1)',
    ...(opts.style || {})
  }
  textDataset.runtime.config = {
    heightUnit: 'auto',
    ...(opts.config || {})
  }

  if (opts.bindings) textDataset.bindings = opts.bindings || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(textDataset, opts.breakpoint)
  }

  return textDataset
}

export const createImageDataset = (opts: any = {}) => {
  const image = cloneDeep(SKELETON)

  image.id = 'IMAGE-DATASET-' + randomString(8)
  image.type = 'image-dataset'

  image.runtime.style = {
    width: 200,
    height: 200,
    ...(opts.style || {})
  }

  image.runtime.config = {
    heightUnit: 'auto',
    ...(opts.config || {})
  }

  if (opts.bindings) image.bindings = opts.bindings || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(image, opts.breakpoint)
  }

  return image
}

export const createEmail = (opts: any) => {
  const email = cloneDeep(SKELETON)

  email.id = 'EMAIL-' + randomString(8)
  email.type = 'email'

  email.runtime.style = opts.style || {}
  email.runtime.config = opts.config || {}
  email.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(email, opts.breakpoint)
  }

  return email
}

export const createPhoneNumber = (opts: any) => {
  const input = cloneDeep(SKELETON)

  input.id = 'PHONE-NUMBER-' + randomString(8)
  input.type = 'phone-number'

  input.runtime.style = opts.style || {}
  input.runtime.config = opts.config || {}
  input.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(input, opts.breakpoint)
  }

  return input
}

export const createRetypePhoneNumber = (opts: any) => {
  const input = cloneDeep(SKELETON)
  input.id = 'RETYPE-PHONE-NUMBER-' + randomString(8)
  input.type = 'retype-phone-number'
  input.runtime.stype = opts.style || {}
  input.runtime.config = opts.config || {}
  input.specials = opts.specials || {}
  if(opts.breakpoint){
    buildElementWithBreakpoint(input, opts.breakpoint)
  }
  return input

}

export const createPostalCode = (opts: any) => {
  const postalCode = cloneDeep(SKELETON)

  postalCode.id = 'POSTAL-CODE-' + randomString(8)
  postalCode.type = 'postal-code'

  postalCode.runtime.style = opts.style || {}
  postalCode.runtime.config = opts.config || {}
  postalCode.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(postalCode, opts.breakpoint)
  }

  return postalCode
}

export const createSubmitButton = (opts: any = {}) => {
  const button = cloneDeep(SKELETON)

  button.id = 'SUBMIT-BUTTON-' + randomString(8)
  button.type = 'submit-button'

  button.runtime.style = opts.style || {}
  button.runtime.config = opts.config || {}

  button.specials = {
    text: opts.specials?.text || 'Submit'
  }

  return button
}

export const createCartItems = (opts: any = {}) => {
  const cart = cloneDeep(SKELETON)

  cart.id = 'CART-ITEMS-' + randomString(8)
  cart.type = 'cart-items'

  cart.runtime.style = opts.style || {}
  cart.runtime.config = opts.config || {}
  cart.children = opts.children || []

  return cart
}

export const createQuantityInput = (opts: any = {}) => {
  const input = cloneDeep(SKELETON)

  input.id = 'QUANTITY-INPUT-' + randomString(8)
  input.type = 'quantity-input'

  input.runtime.style = {
    borderColor: "rgba(0, 0, 0, 1)",
    borderStyle: "solid",
    borderWidth: "1px",
    ...opts.style
  }
  input.runtime.config = opts.config || {}

  // Every surveyed template hides the native number spinner on product/cart steppers.
  input.specials = { spinner: 'hide-spin', ...(opts.specials || {}) }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(input, opts.breakpoint)
  }

  return input
}

export const createDropdown = (opts: any = {}) => {
  const dropdown = cloneDeep(SKELETON)

  dropdown.id = 'DROPDOWN-' + randomString(8)
  dropdown.type = 'dropdown'

  dropdown.runtime.style = opts.style || {}
  dropdown.runtime.config = opts.config || {}

  if (opts.children) dropdown.children = opts.children || []
  if (opts.specials) dropdown.specials = opts.specials

  return dropdown
}

export const createDropdownContent = (opts: any = {}) => {
  const content = cloneDeep(SKELETON)

  content.id = 'DROPDOWN-CONTENT-' + randomString(8)
  content.type = 'dropdown-content'

  content.runtime.style = opts.style || {}
  content.runtime.config = opts.config || {}

  content.children = opts.children || []

  return content
}

export const createRadioGroup = (opts: any = {}) => {
  const radio = cloneDeep(SKELETON)

  radio.id = 'RADIO-GROUP-' + randomString(8)
  radio.type = 'radio-group'

  radio.runtime.style = opts.style || {}
  radio.runtime.config = opts.config || {}

  radio.specials = opts.specials || {}

  return radio
}

export const createCheckboxGroup = (opts: any = {}) => {
  const checkbox = cloneDeep(SKELETON)

  checkbox.id = 'CHECKBOX-GROUP-' + randomString(8)
  checkbox.type = 'checkbox-group'

  checkbox.runtime.style = opts.style || {}
  checkbox.runtime.config = opts.config || {}

  checkbox.specials = opts.specials || {}

  return checkbox
}

export const createTwoPointRange = (opts: any = {}) => {
  const range = cloneDeep(SKELETON)

  range.id = 'TWO-POINT-RANGE-' + randomString(8)
  range.type = 'two-point-range'

  range.runtime.style = opts.style || {}
  range.runtime.config = opts.config || {}

  range.specials = opts.specials || {}

  return range
}

export const createCartDroppable = (opts: any = {}) => {
  const cartDroppable = cloneDeep(SKELETON)

  cartDroppable.id = 'CART-DROPPABLE-' + randomString(8)
  cartDroppable.type = 'cart-droppable'
  cartDroppable.specials = opts.specials || {}

  cartDroppable.children = opts.children || []

  return cartDroppable
}

export const createButtonLoginGG = (opts: any = {}) => {
  const button = cloneDeep(SKELETON)

  button.id = 'BUTTON-LOGIN-GOOGLE-' + randomString(8)
  button.type = 'button-login-google'

  button.runtime.style = opts.style || {}
  button.runtime.config = opts.config || {}
  button.specials = opts.specials || {}
  button.events = opts.events || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(button, opts.breakpoint)
  }

  return button
}

export const createButtonLoginFB = (opts: any = {}) => {
  const button = cloneDeep(SKELETON)

  button.id = 'BUTTON-LOGIN-FACEBOOK-' + randomString(8)
  button.type = 'button-login-facebook'

  button.runtime.style = opts.style || {}
  button.runtime.config = opts.config || {}
  button.specials = opts.specials || {}
  button.events = opts.events || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(button, opts.breakpoint)
  }
  return button
}

export const createPassWord = (opts: any) => {
  const password = cloneDeep(SKELETON)

  password.id = 'PASSWORD-' + randomString(8)
  password.type = 'password'

  password.runtime.style = opts.style || {}
  password.runtime.config = opts.config || {}
  password.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(password, opts.breakpoint)
  }

  return password
}

export const createRetypePassWord = (opts: any) => {
  const password = cloneDeep(SKELETON)

  password.id = 'RETYPE-PASSWORD-' + randomString(8)
  password.type = 'retype-password'

  password.runtime.style = opts.style || {}
  password.runtime.config = opts.config || {}
  password.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(password, opts.breakpoint)
  }

  return password
}
  
export const createCurrentPassWord = (opts: any) => {
  const password = cloneDeep(SKELETON)

  password.id = 'CURRENT-PASSWORD-' + randomString(8)
  password.type = 'current-password'

  password.runtime.style = opts.style || {}
  password.runtime.config = opts.config || {}
  password.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(password, opts.breakpoint)
  }

  return password
}

export const createMemberDropdown = (opts: any = {}) => {
  const submenu = cloneDeep(SKELETON)

  submenu.id = 'MEMBER-DROPDOWN-' + randomString(8)
  submenu.type = 'member-dropdown'

  submenu.specials = { ...opts }
  submenu.children = opts.children || []

  return submenu
}

export const createAttribute = (opts: any = {}) => {
  const attr = cloneDeep(SKELETON)

  attr.id = 'ATTR-' + randomString(8)
  attr.type = 'attr'

  attr.runtime.style = opts.style || {}
  attr.runtime.config = opts.config || {}
  attr.runtime.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(attr, opts.breakpoint)
  }

  return attr
}

export const createDetectAddress = (opts: any = {}) => {
  const input = cloneDeep(SKELETON)
  input.id = 'DETECT-ADDRESS-' + randomString(8)
  input.type = 'detect-address'
  input.runtime.config = { ...opts.config }
  input.runtime.style = { ...opts.style }
  input.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(input, opts.breakpoint)
  }
  return input
}

export const createPayment = (opts: any = {}) => {
  const payment = cloneDeep(SKELETON)
  payment.id = 'PAYMENT-' + randomString(8)

  payment.type = 'payment'

  payment.children = opts.children || []
  payment.runtime.style = { ...opts.style }
  payment.runtime.config = { ...opts.config }
  payment.specials = { ...opts.specials }

  return payment
}

export const createCollapse = (opts: any = {}) => {
  const collapse = cloneDeep(SKELETON)

  collapse.id = `COLLAPSE-${randomString(8)}`
  collapse.type = 'collapse'
  collapse.runtime.style = opts.style || {}
  collapse.runtime.config = opts.config || {}
  collapse.specials = opts.specials || {}

  if(opts.children) collapse.children = opts.children || []

  return collapse
}

export const createCollapseItem = (opts: any = {}) => {
  const collapseItem = cloneDeep(SKELETON)

  collapseItem.id = `COLLAPSE-ITEM-${randomString(8)}`
  collapseItem.type = 'collapse-item'

  collapseItem.runtime.style = opts.style || {}
  collapseItem.runtime.config = opts.config || {}
  collapseItem.specials = {...opts.specials}

  if(opts.children) collapseItem.children = opts.children || []

  return collapseItem
}

export const createCollapseContent = (opts: any = {}) => {
  const collapseContent = cloneDeep(SKELETON)

  collapseContent.id = `COLLAPSE-CONTENT-${randomString(8)}`
  collapseContent.type = 'collapse-content'

  collapseContent.runtime.style = opts.style || {}
  collapseContent.runtime.config = opts.config || {}
  collapseContent.specials = {...opts.specials}

  if(opts.children) collapseContent.children = opts.children || []

  return collapseContent
}
export const createDeliveryMethod = (opts: any = {}) => {
  const payment = cloneDeep(SKELETON)
  payment.id = 'DELIVERY-METHOD-' + randomString(8)

  payment.type = 'delivery-method'

  payment.children = opts.children || []
  payment.runtime.style = { ...opts.style }
  payment.runtime.config = { ...opts.config }
  payment.specials = { ...opts.specials }

  return payment
}

export const createSearchDroppable = (opts: any = {}) => {
  const searchDroppable = cloneDeep(SKELETON)

  searchDroppable.id = 'SEARCH-DROPPABLE-' + randomString(8)
  searchDroppable.type = 'search-droppable'

  searchDroppable.children = opts.children || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(searchDroppable, opts.breakpoint)
  }

  return searchDroppable
}

export const createProductOverlay = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'PRODUCT-OVERLAY-' + randomString(8)
  element.type = 'product-overlay'

  element.children = opts.children || []
  element.specials = {
    type: opts.type || 'discount'
  }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createCustomLayout = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'CUSTOM-LAYOUT-' + randomString(8)
  element.type = 'custom-layout'

  element.children = opts.children || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createListOrdered = (opts: any = {}) => {
  const ordered = cloneDeep(SKELETON)

  ordered.id = 'LIST-ORDERED-' + randomString(8)
  ordered.type = 'list-ordered'

  ordered.children = opts.children || []
  ordered.runtime.style = { ...opts.style }
  ordered.runtime.config = { ...opts.config }
  ordered.specials = {
    tableItems: [
      { name: '', key: 'id', i18nKey: 'trait.code_order' },
      { name: '', key: 'full_name', i18nKey: 'send_email.customer_name' },
      { name: '', key: 'invoice_value', i18nKey: 'trait.total_price' },
      { name: '', key: 'status', i18nKey: 'common.status' },
    ],
    ...opts.specials
  }

  return ordered
}

export const createInputFile = (opts: any = {}) => {
  const input = cloneDeep(SKELETON)
  input.id = 'INPUT-FILE-' + randomString(8)
  input.type = 'input-file'
  input.runtime.config = { ...opts.config }
  input.runtime.style = { ...opts.style }
  input.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(input, opts.breakpoint)
  }
  return input
}

export const createOrderItems = (opts: any = {}) => {
  const order = cloneDeep(SKELETON)

  order.id = 'ORDER-ITEMS-' + randomString(8)
  order.type = 'order-items'

  order.runtime.style = opts.style || {}
  order.runtime.config = opts.config || {}
  order.children = opts.children || []

  return order
}

export const createPostList = (opts: any = {}) => {
  const post = cloneDeep(SKELETON)

  post.id = 'POST-LIST-' + randomString(8)
  post.type = 'post-list'

  post.runtime.config = opts.config || {}
  post.runtime.style = opts.style || {}

  return post
}

export const createSliderPost = (opts: any = {}) => {
  const post = cloneDeep(SKELETON)

  post.id = 'SLIDER-POST-' + randomString(8)
  post.type = 'slider-post'

  post.runtime.config = opts.config || {}
  post.runtime.style = opts.style || {}

  return post
}

export const createWarehouseDataset = (opts: any = {}) => {
  const warehouseDataset = cloneDeep(SKELETON)
  warehouseDataset.id = 'WAREHOUSE-DATASET-' + randomString(8)
  warehouseDataset.type = 'warehouse-dataset'

  warehouseDataset.runtime.style = {
    width: 400,
    height: 200,
    color: '#000000',
    ...(opts.style || {})
  }

  warehouseDataset.runtime.config = {
    heightUnit: 'auto',
    ...(opts.config || {})
  }

  if(opts.bindings) warehouseDataset.bindings = opts.bindings || []

  return warehouseDataset
}

export const createCoupon = (opts: any = {}) => {
  const coupon = cloneDeep(SKELETON)

  coupon.id = 'COUPON-' + randomString(8)
  coupon.type = 'coupon'

  coupon.runtime.style = {...(opts.style || {})}
  coupon.runtime.config = {...(opts.config || {})}
  coupon.runtime.specials = {...(opts.specials || {})}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(coupon, opts.breakpoint)
  }

  return coupon
}

export const createPopup = (opts: any = {}) => {
  const popup = cloneDeep(SKELETON)

  popup.id = 'POPUP-' + randomString(8)
  popup.type = 'popup'

  popup.specials = opts.specials || {}

  popup.children = opts.children || []

  return popup
}

export const createInputDate = (opts: any = {}) => {
  const coupon = cloneDeep(SKELETON)

  coupon.id = 'INPUT-DATE-' + randomString(8)
  coupon.type = 'input-date'

  coupon.runtime.style = {...(opts.style || {})}
  coupon.runtime.config = {...(opts.config || {})}
  coupon.runtime.specials = {...(opts.specials || {})}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(coupon, opts.breakpoint)
  }

  return coupon
}

export const createTabs = (opts: any = {}) => {
  const tabs = cloneDeep(SKELETON)

  tabs.id = 'TABS-' + randomString(8)
  tabs.type = 'tabs'

  tabs.runtime.style = {...(opts.style || {})}
  tabs.runtime.config = {...(opts.config || {})}
  tabs.runtime.specials = {
    ...(opts.specials || {}),
    activeTab: 0
  }

  tabs.children = opts.children || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(tabs, opts.breakpoint)
  }

  return tabs
}

export const createOrderHistory = (opts: any = {}) => {
  const order = cloneDeep(SKELETON)

  order.id = 'ORDER-HISTORY-' + randomString(8)
  order.type = 'order-history'

  order.runtime.style = {
    ...opts.style
  }
  order.runtime.config = {
    heightUnit: 'auto',
    grid: '1x1',
    columns: [{ unit: 'fr', value: 1 }],
    rows: [{ unit: 'min/max', min: { unit: 'px', absValue: 300 }, max: { unit: 'max-c' }}],
    ...opts.config
  }
  order.children = opts.children || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(order, opts.breakpoint)
  }

  return order
}

export const createCustomerAddress = (opts: any = {}) => {
  const ca = cloneDeep(SKELETON)

  ca.id = 'CUSTOMER-ADDRESS-' + randomString(8)
  ca.type = 'customer-address'

  ca.runtime.style = {
    ...opts.style
  }

  ca.runtime.config = {
    heightUnit: 'auto',
    grid: '1x1',
    columns: [{ unit: 'fr', value: 1 }],
    rows: [{ unit: 'min/max', min: { unit: 'px', absValue: 300 }, max: { unit: 'max-c' }}],
    ...opts.config
  }

  ca.children = opts.children || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(ca, opts.breakpoint)
  }

  return ca
}

export const createUserPointLog = (opts: any = {}) => {
  const upl = cloneDeep(SKELETON)

  upl.id = 'USER-POINT-LOG-' + randomString(8)
  upl.type = 'user-point-log'

  upl.runtime.style = {...opts.style}
  upl.runtime.config = {...opts.config}
  upl.runtime.specials = {...opts.specials}


  if (opts.breakpoint) {  
    buildElementWithBreakpoint(upl, opts.breakpoint)
  }
  
  return upl
}

export const createLayoutDataset = (opts: any = {}) => {
  const layout = cloneDeep(SKELETON)

  layout.id = 'LAYOUT-DATASET' + randomString(8)
  layout.type = 'layout-dataset'

  layout.runtime.style = opts.style || {}
  layout.runtime.config = opts.config || {}
  layout.children = opts.children || []

  if (opts.bindings) layout.bindings = opts.bindings || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(layout, opts.breakpoint)
  }
  return layout
}

export const createFlashSale = (opts: any = {}) => {
  const flash = cloneDeep(SKELETON)

  flash.id = 'FLASH-SALE-' + randomString(8)
  flash.type = 'flash-sale'

  flash.runtime.style = {...(opts.style || {})}
  flash.runtime.config = {...(opts.config || {})}
  flash.runtime.specials = {...(opts.specials || {})}

  flash.children = opts.children || []

  return flash
}

export const createCalendar = (opts: any = {}) => {
  const calendar = cloneDeep(SKELETON)

  calendar.id = 'CALENDAR-' + randomString(8)
  calendar.type = 'calendar'

  calendar.runtime.style = {...(opts.style || {})}
  calendar.runtime.config = {...(opts.config || {})}
  calendar.runtime.specials = {...(opts.specials || {})}

  calendar.children = opts.children || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(calendar, opts.breakpoint)
  }

  return calendar
}

export const createCalendarContent = (opts: any = {}) => {
  const calendar = cloneDeep(SKELETON)

  calendar.id = 'CALENDAR-CONTENT-' + randomString(8)
  calendar.type = 'calendar-content'

  calendar.runtime.style = {...(opts.style || {})}
  calendar.runtime.config = {...(opts.config || {})}
  calendar.runtime.specials = {...(opts.specials || {})}

  calendar.children = opts.children || []

  return calendar
}

export const createPromotionsShort = (opts: any = {}) => {
  const promotions_short = cloneDeep(SKELETON)

  promotions_short.id = 'PROMOTIONS-SHORT-' + randomString(8)
  promotions_short.type = 'promotions-short'

  promotions_short.runtime.style = {...(opts.style || {})}
  promotions_short.runtime.config = {...(opts.config || {})}
  promotions_short.runtime.specials = {...(opts.specials || {})}

  return promotions_short
}

export const createPromotions = (opts: any = {}) => {
  const promotions = cloneDeep(SKELETON)

  promotions.id = 'PROMOTIONS-' + randomString(8)
  promotions.type = 'promotions'

  promotions.runtime.style = {...(opts.style || {})}
  promotions.runtime.config = {...(opts.config || {})}
  promotions.runtime.specials = {...(opts.specials || {})}

  promotions.children = opts.children || []

  return promotions
}

export const createRatingInput = (opts: any = {}) => {
  const rating = cloneDeep(SKELETON)

  rating.id = 'RATING-INPUT-' + randomString(8)
  rating.type = 'rating-input'

  rating.runtime.style = {...(opts.style || {})}
  rating.runtime.config = {
    ...(opts.config || {}),
    heightUnit: 'auto'
  }
  rating.runtime.specials = {...(opts.specials || {})}

  rating.children = opts.children || []

  return rating
}

export const createBreadcrumb = (opts: any = {}) => {
  const breadcrumb = cloneDeep(SKELETON)
  breadcrumb.id = 'BREADCRUMB-' + randomString(8)
  breadcrumb.type = 'breadcrumb'

  breadcrumb.runtime.style = {...(opts.style || {})}
  breadcrumb.runtime.config = {...(opts.config || {})}
  breadcrumb.runtime.specials = {...(opts.specials || {})}
  breadcrumb.children = opts.children || []

  return breadcrumb
}

export const createLanguageMenu = (opts: any = {}) => {
  const menu = cloneDeep(SKELETON)

  menu.id = 'LANGUAGE-MENU-' + randomString(8)
  menu.type = 'language-menu'

  menu.runtime.style = opts.style || {}
  menu.runtime.config = opts.config || {}
  menu.runtime.specials = opts.specials || {}

  return menu
}

export const createGridCategories = (opts: any = {}) => {
  const grid_categories = cloneDeep(SKELETON)
  grid_categories.id = 'GRID-CATE-' + randomString(8)
  grid_categories.type = 'grid-category'

  grid_categories.runtime.style = {
    width: opts.width,
    height: 354
  }

  grid_categories.runtime.config = { heightUnit: 'auto' }
  grid_categories.runtime.specials = {...(opts.specials || {})}
  grid_categories.children = opts.children || []

  return grid_categories
}

export const createSliderCategories = (opts: any = {}) => {
  const slider_categories = cloneDeep(SKELETON)
  slider_categories.id = 'SLIDER-CATE-' + randomString(8)
  slider_categories.type = 'slider-category'

  slider_categories.runtime.style = {
    width: opts.width,
    height: 354
  }

  slider_categories.runtime.config = { heightUnit: 'auto' }
  slider_categories.runtime.specials = {...(opts.specials || {})}
  slider_categories.children = opts.children || []

  return slider_categories
}

export const createGridBlog = (opts: any = {}) => {
  const grid_blog = cloneDeep(SKELETON)
  grid_blog.id = 'GRID-BLOG-' + randomString(8)
  grid_blog.type = 'grid-blog'

  grid_blog.runtime.style = {
    width: opts.width,
    height: 354
  }

  grid_blog.runtime.config = { heightUnit: 'auto' }
  grid_blog.runtime.specials = {...(opts.specials || {})}
  grid_blog.children = opts.children || []

  return grid_blog
}

export const createSliderBlog = (opts: any = {}) => {
  const slider_blog = cloneDeep(SKELETON)
  slider_blog.id = 'SLIDER-BLOG-' + randomString(8)
  slider_blog.type = 'slider-blog'

  slider_blog.runtime.style = {
    width: opts.width,
    height: 354
  }

  slider_blog.runtime.config = { heightUnit: 'auto' }
  slider_blog.runtime.specials = {...(opts.specials || {})}
  slider_blog.children = opts.children || []

  return slider_blog
}

export const createTags = (opts: any = {}) => {
  const tags = cloneDeep(SKELETON)
  tags.id = 'TAGS-' + randomString(8)
  tags.type = 'tags'

  tags.runtime.style = {
    width: opts.width || 200,
    height: opts.height || 40
  }
  tags.runtime.config = {
    ...(opts.config || {}),
    heightUnit: 'auto'
  }
  tags.runtime.specials = {
    ...(opts.specials || {}),
    options: [
      { id: 'TAGS-ITEM-' + randomString(8), name: 'Description'},
      { id: 'TAGS-ITEM-' + randomString(8), name: 'Size'},
      { id: 'TAGS-ITEM-' + randomString(8), name: 'Rating'},
      { id: 'TAGS-ITEM-' + randomString(8), name: 'For you'}
    ]
  }
  tags.children = opts.children || []

  return tags
}

export const createPayPalButton = (opts: any = {}) => {
  const paypal = cloneDeep(SKELETON)
  paypal.id = 'PAYPAL-' + randomString(8)
  paypal.type = 'paypal-button'

  paypal.runtime.style = opts.style || {}

  return paypal
}

export const createNumberStep = (opts: any = {}) => {
  const number_step = cloneDeep(SKELETON)
  number_step.id = 'NUMBER-STEP-' + randomString(8)
  number_step.type = 'number-step'

  number_step.runtime.style = opts.style || {}
  number_step.runtime.config = opts.config || {}
  number_step.runtime.specials = opts.specials || {}

  return number_step
}

export const createWarehouse = (opts: any = {}) => {
  const warehouse = cloneDeep(SKELETON)
  warehouse.id = 'WAREHOUSE-' + randomString(8)
  warehouse.type = 'warehouse'
  
  warehouse.runtime.style = opts.style || {}
  warehouse.runtime.config = opts.config || {}
  warehouse.runtime.specials = opts.specials || {}
  warehouse.children = opts.children || []

  return warehouse
}

export const createProductReview = (opts: any = {}) => {
  const review = cloneDeep(SKELETON)
  review.id = 'PRODUCT-REVIEW-' + randomString(8)
  review.type = 'product-review'

  review.runtime.style = opts.style || {}
  review.runtime.config = opts.config || {}
  review.runtime.specials = opts.specials || {}

  return review
}

export const createMasonryReview = (opts: any = {}) => {
  const masonry = cloneDeep(SKELETON)
  masonry.id = 'MASONRY-REVIEW-' + randomString(8)
  masonry.type = 'masonry-review'

  masonry.runtime.style = opts.style || {}
  masonry.runtime.config = opts.config || {}
  masonry.runtime.specials = opts.specials || {}

  return masonry
}

export const createEmptyProductLayout = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'EMPTY-PRODUCT-LAYOUT-' + randomString(8)
  element.type = 'empty-product-layout'

  element.runtime.specials = opts.specials || {}
  element.runtime.style = opts.style || {}
  element.runtime.config = opts.config || {}
  element.children = opts.children || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createAgency = (opts: any = {}) => {
  const agency = cloneDeep(SKELETON)

  agency.id = 'AGENCY-' + randomString(8)
  agency.type = 'agency'

  agency.runtime.style = {...(opts.style || {})}
  agency.runtime.config = {...(opts.config || {})}
  agency.runtime.specials = {...(opts.specials || {})}

  agency.children = opts.children || []

  return agency
}

export const createSearchFrom = (opts: any = {}) => {
  const input = cloneDeep(SKELETON)
  input.id = 'SEARCH-FORM-' + randomString(8)
  input.type = 'search-form'
  input.runtime.config = { ...opts.config }
  input.runtime.style = { ...opts.style }
  input.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(input, opts.breakpoint)
  }
  return input
}

export const createOtpInput = (opts: any = {}) => {
  const input = cloneDeep(SKELETON)
  input.id = 'OTP-INPUT-' + randomString(8)
  input.type = 'otp-input'
  input.runtime.config = { ...opts.config }
  input.runtime.style = { ...opts.style }
  input.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(input, opts.breakpoint)
  }
  return input
}

export const createTable = (opts: any = {}) => {
  const table = cloneDeep(SKELETON)
  table.id = 'TABLE-' + randomString(8)
  table.type = 'table'
  table.runtime.config = { ...opts.config }
  table.runtime.style = { ...opts.style }
  table.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(table, opts.breakpoint)
  }
  return table
}

export const createAutoNumber = (opts: any = {}) => {
  const number = cloneDeep(SKELETON)
  number.id = 'AUTO-NUMBER-' + randomString(8)
  number.type = 'auto-number'
  number.runtime.config = { ...opts.config }
  number.runtime.style = { ...opts.style }
  number.specials = { ...opts.specials }

  return number
}

export const createRandomNumber = (opts: any = {}) => {
  const number = cloneDeep(SKELETON)
  number.id = 'RANDOM-NUMBER-' + randomString(8)
  number.type = 'random-number'
  number.runtime.config = { ...opts.config }
  number.runtime.style = { ...opts.style }
  number.specials = { ...opts.specials }

  return number
}

export const createBonusItems = (opts: any = {}) => {
  const item = cloneDeep(SKELETON)

  item.id = 'BONUS-ITEMS-' + randomString(8)
  item.type = 'bonus-items'

  item.runtime.style = opts.style || {}
  item.runtime.config = opts.config || {}
  item.children = opts.children || []
  item.specials = { ...opts.specials }

  if (opts.specials?.typeBonus == 'combo_product') {
    item.name = 'COMBO-ITEMS-' + randomString(8)
  }

  return item
}

export const createInputNumber = (opts: any = {}) => {
  const input = cloneDeep(SKELETON)
  input.id = 'INPUT-NUMBER' + randomString(8)
  input.type = 'input-number'
  input.runtime.config = { ...opts.config }
  input.runtime.style = { ...opts.style }
  input.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(input, opts.breakpoint)
  }
  return input
}

export const createCheckboxItem = (opts: any = {}) => {
  const item = cloneDeep(SKELETON)
  item.id = 'CHECKBOX-ITEM-' + randomString(8)
  item.type = 'checkbox-item'
  item.runtime.config = { ...opts.config }
  item.runtime.style = { ...opts.style }
  item.specials = { ...opts.specials }

  return item
}

export const createCountry = (opts: any = {}) => {
  const country = cloneDeep(SKELETON)
  country.id = 'COUNTRY-' + randomString(8)
  country.type = 'country'
  country.runtime.config = { ...opts.config }
  country.runtime.style = { ...opts.style }
  country.specials = { ...opts.specials }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(country, opts.breakpoint)
  }

  return country
}

export const createColorGroup = (opts: any = {}) => {
  const color_group = cloneDeep(SKELETON)
  color_group.id = 'COLOR-GROUP-' + randomString(8)
  color_group.type = 'color-group'
  color_group.runtime.config = { ...opts.config }
  color_group.runtime.style = { ...opts.style }
  color_group.specials = { ...opts.specials }

  return color_group
}
export const createCartItemEmpty = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'CART-ITEMS-EMPTY-' + randomString(8)
  element.type = 'cart-items-empty'

  element.runtime.style = opts.style || {}
  element.runtime.config = opts.config || {}
  element.specials = opts.specials || {}
  element.children = opts.children || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createLuckyWheel = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'LUCKY-WHEEL-' + randomString(8)
  element.type = 'lucky-wheel'

  element.runtime.style = opts.style || {}
  element.runtime.config = opts.config || {}
  element.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createTeeForm = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'TEE-FORM-' + randomString(8)
  element.type = 'tee-form'

  element.runtime.style = opts.style || {}
  element.runtime.config = opts.config || {}
  element.specials = opts.specials || {}

  return element
}

export const createRewardPoint = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'REWARD-POINT-' + randomString(8)
  element.type = 'reward-point'

  element.runtime.style = {...(opts.style || {})}
  element.runtime.config = {...(opts.config || {})}
  element.runtime.specials = {...(opts.specials || {})}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createReferralCode = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'REFERRAL-CODE-' + randomString(8)
  element.type = 'referral-code'

  element.runtime.style = {...(opts.style || {})}
  element.runtime.config = {...(opts.config || {})}
  element.runtime.specials = {...(opts.specials || {})}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createLocation = (opts: any = {}) => {
  const button = cloneDeep(SKELETON)

  button.id = 'CURRENT-LOCATION-' + randomString(8)
  button.type = 'current-location'


  button.runtime.style = opts.style || {}
  button.runtime.config = opts.config || {}

  button.specials = {
    text: opts.specials?.text || 'Current location',
    field_type: opts.specials?.field_type || 'current-location',
    field_name: opts.specials?.field_name || 'current location'
  }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(button, opts.breakpoint)
  }

  return button
}

export const createPostOverlay = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'POST-OVERLAY-' + randomString(8)
  element.type = 'post-overlay'

  element.children = opts.children || []
  element.specials = {
    type: opts.type || 'regular'
  }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createBlogOverlay = (opts: any = {}) => {
  const element = cloneDeep(SKELETON)

  element.id = 'BLOG-OVERLAY-' + randomString(8)
  element.type = 'blog-overlay'

  element.children = opts.children || []
  element.specials = {
    type: opts.type || 'regular'
  }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(element, opts.breakpoint)
  }

  return element
}

export const createVideoDataset = (opts: any = {}) => {
  const video = cloneDeep(SKELETON)

  video.id = 'VIDEO-DATASET-' + randomString(8)
  video.type = 'video-dataset'

  video.runtime.style = {
    width: 200,
    height: 200,
    ...(opts.style || {})
  }

  video.runtime.config = {
    heightUnit: 'auto',
    ...(opts.config || {})
  }

  if (opts.bindings) video.bindings = opts.bindings || []

  if (opts.breakpoint) {
    buildElementWithBreakpoint(video, opts.breakpoint)
  }

  return video
}

export const createLessonSidebar = (opts: any = {}) => {
  const sidebar = cloneDeep(SKELETON)

  sidebar.id = 'LESSON-SIDEBAR-' + randomString(8)
  sidebar.type = 'lesson-sidebar'

  sidebar.runtime.style = {
    width: 200,
    height: 400,
    ...(opts.style || {})
  }

  sidebar.runtime.config = {
    heightUnit: 'auto',
    ...(opts.config || {})
  }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(sidebar, opts.breakpoint)
  }

  return sidebar
}


export const createSwitch = (opts: any = {}) => {
  const switchElement = cloneDeep(SKELETON)

  switchElement.id = 'SWITCH-' + randomString(8)
  switchElement.type = 'switch'

  switchElement.runtime.style = {
    width: 44,
    height: 22,
    ...(opts.style || {})
  }

  switchElement.runtime.config = {
    ...(opts.config || {})
  }

  if (opts.breakpoint) {
    buildElementWithBreakpoint(switchElement, opts.breakpoint)
  }
  
  return switchElement
}

export const createEmailOrPhone = (opts: any) => {
  const email = cloneDeep(SKELETON)

  email.id = 'IDENTITY-' + randomString(8)
  email.type = 'identity'

  email.runtime.style = opts.style || {}
  email.runtime.config = opts.config || {}
  email.specials = opts.specials || {}

  if (opts.breakpoint) {
    buildElementWithBreakpoint(email, opts.breakpoint)
  }

  return email
}

export const createQuestionContainer = (opts: any = {}) => {
  const questionContainer = cloneDeep(SKELETON)
  questionContainer.id = 'QUESTION-CONTAINER-' + randomString(8)
  questionContainer.type = 'question-container'

  questionContainer.children = opts.children || []
  questionContainer.style = {...(opts.style || {})}

  if(opts.runtime) questionContainer.runtime = {...(opts.runtime || {})}

  return questionContainer
}

export const createNextLessonDroppable = (opts: any = {}) => {
  const nextlesson = cloneDeep(SKELETON)
  nextlesson.id = 'NEXT-LESSON-DROPPABLE-' + randomString(8)
  nextlesson.type = 'next-lesson-droppable'
  nextlesson.children = opts.children || []
  return nextlesson
}

export const createListLessonDroppable = (opts: any = {}) => {
  const nextlesson = cloneDeep(SKELETON)
  nextlesson.id = 'LIST-LESSON-DROPPABLE-' + randomString(8)
  nextlesson.type = 'list-lesson-droppable'
  nextlesson.children = opts.children || []
  return nextlesson
}

export const createLessonItems = (opts: any = {}) => {
  const nextlesson = cloneDeep(SKELETON)
  nextlesson.id = 'LESSON-ITEMS-' + randomString(8)
  nextlesson.type = 'lesson-items'
  nextlesson.runtime.style = { ...opts.style }
  nextlesson.runtime.config = { ...opts.config }
  nextlesson.children = opts.children || []
  nextlesson.specials = { ...opts.specials }

  return nextlesson
}