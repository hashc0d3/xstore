import { CreateLeadDto } from "./dto/create-lead.dto";

export function formatLeadMessage(title: string, dto: CreateLeadDto): string {
  return [
    title,
    `Тип: ${dto.type}`,
    `Телефон: ${dto.phone}`,
    dto.customerName ? `Имя: ${dto.customerName}` : "",
    dto.telegram ? `Telegram: ${dto.telegram}` : "",
    dto.contactMethod ? `Способ связи: ${dto.contactMethod}` : "",
    dto.paymentMethod ? `Оплата: ${dto.paymentMethod}` : "",
    dto.deliveryMethod ? `Получение: ${dto.deliveryMethod}` : "",
    dto.deliveryAddress ? `Адрес доставки: ${dto.deliveryAddress}` : "",
    dto.apartmentOffice ? `Квартира / офис: ${dto.apartmentOffice}` : "",
    dto.entrance ? `Подъезд: ${dto.entrance}` : "",
    dto.floor ? `Этаж: ${dto.floor}` : "",
    dto.intercom ? `Домофон: ${dto.intercom}` : "",
    dto.comment ? `Комментарий: ${dto.comment}` : "",
    dto.consent ? `Согласие ПД: ${dto.consent}` : "",
    dto.deviceFrom ? `Устройство для обмена: ${dto.deviceFrom}` : "",
    dto.deviceTo ? `Устройство к покупке: ${dto.deviceTo}` : "",
    dto.targetDevice ? `Желаемое устройство: ${dto.targetDevice}` : "",
    dto.productName ? `Наименование: ${dto.productName}` : "",
    dto.color ? `Цвет: ${dto.color}` : "",
    dto.memory ? `Объем памяти: ${dto.memory}` : "",
    dto.simType ? `Тип SIM: ${dto.simType}` : "",
    dto.screen ? `Диагональ / экран: ${dto.screen}` : "",
    dto.ram ? `RAM: ${dto.ram}` : "",
    dto.cartItems ? `Товары:\n${dto.cartItems}` : "",
    dto.subtotal ? `Сумма товаров: ${dto.subtotal}` : "",
    dto.deliveryPrice ? `Доставка: ${dto.deliveryPrice}` : "",
    dto.totalPrice ? `Итого: ${dto.totalPrice}` : "",
    dto.assessmentModel ? `Модель (выкуп): ${dto.assessmentModel}` : "",
    dto.assessmentMemory ? `Память (выкуп): ${dto.assessmentMemory}` : "",
    dto.assessmentCondition ? `Состояние (выкуп): ${dto.assessmentCondition}` : "",
    dto.assessmentSimType ? `Тип SIM (выкуп): ${dto.assessmentSimType}` : "",
    dto.batteryPercent ? `Батарея: ${dto.batteryPercent}%` : "",
    dto.expectedPrice ? `Ожидаемая цена: ${dto.expectedPrice}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
