import { Knex } from 'knex';
import { createTenantKnex } from '@/lib/db';
import {
  IBillingPeriod,
  IBillingResult,
  IBillingCharge,
  ICompanyBillingPlan,
  IBucketPlan,
  IBucketUsage,
  IBucketCharge,
  IDiscount,
  IAdjustment,
  IUsageBasedCharge,
  ITimeBasedCharge,
  IFixedPriceCharge,
  ICompanyBillingCycle,
  BillingCycleType
} from '@/interfaces/billing.interfaces';
import {
  differenceInCalendarDays,
  differenceInHours,
  differenceInMilliseconds,
  max,
  getDaysInMonth,
  addMilliseconds,
  getYear,
  getMonth,
  parseISO,
  toDate,
  startOfDay,
  endOfDay,
  addDays,
  format,
  isValid
} from 'date-fns';
import { ISO8601String } from '@/types/types.d';
import { getCompanyTaxRate } from '@/lib/actions/invoiceActions';
import { getCompanyById } from '@/lib/actions/companyActions';
import { ICompany } from '@/interfaces';
import { get } from 'http';
import { TaxService } from '@/lib/services/taxService';
import { v4 as uuidv4 } from 'uuid';

export class BillingEngine {
  private knex: Knex;

  constructor() {
    this.knex = null as any;
  }

  private async initKnex() {
    if (!this.knex) {
      this.knex = (await createTenantKnex()).knex;
    }
  }

  private async hasExistingInvoiceForCycle(companyId: string, billingCycleId: string): Promise<boolean> {
    const existingInvoice = await this.knex('invoices')
      .where({
        company_id: companyId,
        billing_cycle_id: billingCycleId
      })
      .first();
    return !!existingInvoice;
  }

  async calculateBilling(companyId: string, startDate: ISO8601String, endDate: ISO8601String, billingCycleId: string): Promise<IBillingResult> {
    await this.initKnex();
    const company = await getCompanyById(companyId);
    console.log(`Calculating billing for company ${company?.company_name} (${companyId}) from ${startDate} to ${endDate}`);
    
    // Check for existing invoice in this billing cycle
    const hasExistingInvoice = await this.hasExistingInvoiceForCycle(companyId, billingCycleId);
    if (hasExistingInvoice) {
      // Return zero-amount billing result if already invoiced
      return {
        charges: [],
        totalAmount: 0,
        discounts: [],
        adjustments: [],
        finalAmount: 0
      };
    }

    // Validate that the billing period doesn't cross a cycle change
    await this.validateBillingPeriod(companyId, startDate, endDate);
    
    const billingPeriod: IBillingPeriod = { startDate, endDate };
    const { companyBillingPlans, billingCycle: cycle } = await this.getCompanyBillingPlansAndCycle(companyId, billingPeriod);
    if (companyBillingPlans.length === 0) {
      throw new Error(`No active billing plans found for company ${companyId} in the given period`);
    }

    console.log(`Found ${companyBillingPlans.length} active billing plan(s) for company ${companyId}`);
    console.log(`Billing cycle: ${cycle}`);

    let totalCharges: IBillingCharge[] = [];

    for (const companyBillingPlan of companyBillingPlans) {
      console.log(`Processing billing plan: ${companyBillingPlan.plan_name}`);
      const [fixedPriceCharges, timeBasedCharges, usageBasedCharges, bucketPlanCharges] = await Promise.all([
        this.calculateFixedPriceCharges(companyId, billingPeriod, companyBillingPlan),
        this.calculateTimeBasedCharges(companyId, billingPeriod, companyBillingPlan),
        this.calculateUsageBasedCharges(companyId, billingPeriod, companyBillingPlan),
        this.calculateBucketPlanCharges(companyId, billingPeriod, companyBillingPlan)
      ]);

      console.log(`Fixed price charges: ${fixedPriceCharges.length}`);
      console.log(`Time-based charges: ${timeBasedCharges.length}`);
      console.log(`Usage-based charges: ${usageBasedCharges.length}`);
      console.log(`Bucket plan charges: ${bucketPlanCharges.length}`);

      console.log(`Total fixed charges before proration: ${fixedPriceCharges.reduce((sum, charge) => sum + charge.total, 0)}`);

      // Only prorate fixed price charges
      const proratedFixedCharges = this.applyProrationToPlan(fixedPriceCharges, billingPeriod, companyBillingPlan.start_date, cycle);

      console.log(`Total fixed charges after proration: ${proratedFixedCharges.reduce((sum, charge) => sum + charge.total, 0)}`);

      // Combine all charges without prorating time-based or usage-based charges
      totalCharges = totalCharges.concat(proratedFixedCharges, timeBasedCharges, usageBasedCharges, bucketPlanCharges);

      console.log('Total charges breakdown:');
      proratedFixedCharges.forEach(charge => {
        console.log(`fixed - ${charge.serviceName}: $${charge.total}`);
      });
      timeBasedCharges.forEach(charge => {
        console.log(`hourly - ${charge.serviceName}: $${charge.total}`);
      });
      usageBasedCharges.forEach(charge => {
        console.log(`usage - ${charge.serviceName}: $${charge.total}`);
      });
      bucketPlanCharges.forEach(charge => {
        console.log(`bucket - ${charge.serviceName}: $${charge.total}`);
      });

      console.log('Total charges:', totalCharges);
    }

    const totalAmount = totalCharges.reduce((sum, charge) => sum + charge.total, 0);

    const finalCharges = await this.applyDiscountsAndAdjustments(
      {
        charges: totalCharges,
        totalAmount,
        discounts: [],
        adjustments: [],
        finalAmount: totalAmount
      },
      companyId,
      billingPeriod
    );

    console.log(`Discounts applied: ${finalCharges.discounts.length}`);
    console.log(`Adjustments applied: ${finalCharges.adjustments.length}`);
    console.log(`Final amount after discounts and adjustments: $${finalCharges.finalAmount}`);

    return {
      charges: finalCharges.charges,
      totalAmount: finalCharges.totalAmount,
      discounts: finalCharges.discounts,
      adjustments: finalCharges.adjustments,
      finalAmount: finalCharges.finalAmount
    };
  }

  private async getCompanyBillingPlansAndCycle(companyId: string, billingPeriod: IBillingPeriod): Promise<{ companyBillingPlans: ICompanyBillingPlan[], billingCycle: string }> {
    await this.initKnex();
    const billingCycle = await this.getBillingCycle(companyId, billingPeriod.startDate);
    const companyBillingPlans = await this.knex('company_billing_plans')
      .join('billing_plans', 'company_billing_plans.plan_id', 'billing_plans.plan_id')
      .where({ 'company_billing_plans.company_id': companyId, 'company_billing_plans.is_active': true })
      .where('company_billing_plans.start_date', '<=', billingPeriod.endDate)
      .where(function (this: any) {
        this.where('company_billing_plans.end_date', '>=', billingPeriod.startDate).orWhereNull('company_billing_plans.end_date');
      })
      .select('company_billing_plans.*', 'billing_plans.plan_name')
      .orderBy('company_billing_plans.start_date', 'desc');

    companyBillingPlans.forEach((plan: any) => {
      plan.start_date = plan.start_date.toISOString();
      plan.end_date = plan.end_date ? plan.end_date.toISOString() : null;
    });

    return { companyBillingPlans, billingCycle };
  }

  private async getBillingCycle(companyId: string, date: ISO8601String = new Date().toISOString()): Promise<string> {
    await this.initKnex();
    const result = await this.knex('company_billing_cycles')
      .where({ company_id: companyId })
      .where('effective_date', '<=', date)
      .orderBy('effective_date', 'desc')
      .first() as ICompanyBillingCycle | undefined;

    if (!result) {
      // Check again for existing cycle to handle race conditions
      const existingCycle = await this.knex('company_billing_cycles')
        .where({ company_id: companyId })
        .first();

      if (existingCycle) {
        return existingCycle.billing_cycle;
      }

      // Insert default monthly cycle if none exists
      const company = await this.knex('companies').where({ company_id: companyId }).first();
      if (!company) {
        throw new Error(`Company ${companyId} not found`);
      }

      try {
        const defaultCycle: Partial<ICompanyBillingCycle> = {
          company_id: companyId,
          billing_cycle: 'monthly',
          effective_date: '2023-01-01T00:00:00Z',
          tenant: company.tenant
        };
        
        await this.knex('company_billing_cycles').insert(defaultCycle);
      } catch (error) {
        // If insert fails due to race condition, get the existing record
        const cycle = await this.knex('company_billing_cycles')
          .where({ company_id: companyId })
          .first();
        return cycle.billing_cycle;
      }
      return 'monthly' as BillingCycleType;
    }

    return result.billing_cycle as BillingCycleType;
  }

  private async validateBillingPeriod(companyId: string, startDate: ISO8601String, endDate: ISO8601String): Promise<void> {
    const cycles = await this.knex('company_billing_cycles')
      .where({ company_id: companyId })
      .where('effective_date', '<=', endDate)
      .orderBy('effective_date', 'asc');

    let currentCycle = null;
    for (const cycle of cycles) {
      if (cycle.effective_date <= startDate) {
        currentCycle = cycle;
      } else if (cycle.effective_date > startDate && cycle.effective_date < endDate) {
        throw new Error('Invoice period cannot span billing cycle change');
      }
    }

    if (!currentCycle) {
      // If no cycle found, create default monthly cycle
      await this.getBillingCycle(companyId, startDate);
    }
  }

  private async calculateFixedPriceCharges(companyId: string, billingPeriod: IBillingPeriod, companyBillingPlan: ICompanyBillingPlan): Promise<IFixedPriceCharge[]> {
    await this.initKnex();
    const company = await this.knex('companies').where({ company_id: companyId }).first() as ICompany;
      
    const planServices = await this.knex('company_billing_plans')
      .join('billing_plans', 'company_billing_plans.plan_id', 'billing_plans.plan_id')
      .join('plan_services', 'billing_plans.plan_id', 'plan_services.plan_id')
      .join('service_catalog', 'plan_services.service_id', 'service_catalog.service_id')
      .where({
        'company_billing_plans.company_id': companyId,
        'company_billing_plans.company_billing_plan_id': companyBillingPlan.company_billing_plan_id,
        'service_catalog.service_type': 'Fixed',
        'billing_plans.plan_type': 'Fixed' 
      })
      .select('service_catalog.*', 'plan_services.quantity', 'plan_services.custom_rate');

    // Calculate charges for each service in the plan
    const fixedCharges: IFixedPriceCharge[] = planServices.map((service: any):IFixedPriceCharge => {
      const charge: IFixedPriceCharge = {
        serviceId: service.service_id,
        serviceName: service.service_name,
        quantity: service.quantity,
        rate: service.custom_rate || service.default_rate,
        total: (service.custom_rate || service.default_rate) * service.quantity,
        type: 'fixed',
        tax_amount: 0,
        tax_rate: 0,
        tax_region: service.tax_region || company.tax_region // Add this line to set the tax_region
      };
  
      if (!company.is_tax_exempt && service.is_taxable !== false) {
        charge.tax_rate = service.tax_rate || 0;
        charge.tax_amount = charge.total * (charge.tax_rate);
      } else {
        charge.tax_rate = 0;
        charge.tax_amount = 0;
      }
  
      return charge;
    });

    console.log(`Fixed price charges for company ${companyId}:`, fixedCharges);
    return fixedCharges;
  }    

  private async calculateTimeBasedCharges(companyId: string, billingPeriod: IBillingPeriod, companyBillingPlan: ICompanyBillingPlan): Promise<ITimeBasedCharge[]> {
    await this.initKnex();
    const query = this.knex('time_entries')
      .join('users', 'time_entries.user_id', 'users.user_id')
      .leftJoin('project_ticket_links', 'time_entries.work_item_id', 'project_ticket_links.ticket_id')
      .leftJoin('project_tasks', 'time_entries.work_item_id', 'project_tasks.task_id')
      .leftJoin('project_phases', 'project_tasks.phase_id', 'project_phases.phase_id')
      .leftJoin('projects', 'project_phases.project_id', 'projects.project_id')
      .leftJoin('tickets', 'time_entries.work_item_id', 'tickets.ticket_id')
      .join('service_catalog', 'time_entries.service_id', 'service_catalog.service_id')
      .join('plan_services', 'service_catalog.service_id', 'plan_services.service_id')
      .andWhere('plan_services.plan_id', companyBillingPlan.plan_id)
      .where('time_entries.start_time', '>=', billingPeriod.startDate)
      .where('time_entries.end_time', '<', billingPeriod.endDate)
      .where('time_entries.invoiced', false)
      .where(function (this: Knex.QueryBuilder) {
        this.where(function (this: Knex.QueryBuilder) {
          this.where('time_entries.work_item_type', '=', 'project_task')
            .whereNotNull('project_tasks.task_id')
        }).orWhere(function (this: Knex.QueryBuilder) {
          this.where('time_entries.work_item_type', '=', 'ticket')
            .whereNotNull('tickets.ticket_id')
        })
      })
      .where(function (this: Knex.QueryBuilder) {
        this.where('projects.company_id', companyId)
          .orWhere('tickets.company_id', companyId)
      })
      .where('service_catalog.category_id', companyBillingPlan.service_category)
      .where('time_entries.approval_status', 'APPROVED')
      .select(
        'time_entries.*',
        'service_catalog.service_name',
        'service_catalog.default_rate',
        'plan_services.custom_rate',
        this.knex.raw('COALESCE(project_tasks.task_name, tickets.title) as work_item_name')
      );

    console.log('Time entries query:', query.toString());
    const timeEntries = await query;

    const timeBasedCharges: ITimeBasedCharge[] = timeEntries.map((entry: any):ITimeBasedCharge => {
      const duration = differenceInHours(entry.end_time, entry.start_time);
      const rate = Math.ceil(entry.custom_rate || entry.default_rate);
      return {
        serviceId: entry.service_id,
        serviceName: entry.service_name,
        userId: entry.user_id,
        duration,
        rate,
        total: Math.round(duration * rate),
        type: 'time',
        tax_amount: 0,
        tax_rate: 0,
        tax_region: entry.tax_region || entry.company_tax_region,
        entryId: entry.entry_id
      };
    });

    return timeBasedCharges;
  }

  private async calculateUsageBasedCharges(companyId: string, billingPeriod: IBillingPeriod, companyBillingPlan: ICompanyBillingPlan): Promise<IUsageBasedCharge[]> {
    await this.initKnex();
    const usageRecords = await this.knex('usage_tracking')
      .join('service_catalog', 'usage_tracking.service_id', 'service_catalog.service_id')
      .join('plan_services', function (this: Knex.JoinClause) {
        this.on('service_catalog.service_id', '=', 'plan_services.service_id')
      })
      .where('usage_tracking.company_id', companyId)
      .where('usage_tracking.invoiced', false)
      .where('usage_tracking.usage_date', '>=', billingPeriod.startDate)
      .where('usage_tracking.usage_date', '<', billingPeriod.endDate)
      .where('service_catalog.category_id', companyBillingPlan.service_category)
      .where('plan_services.plan_id', companyBillingPlan.plan_id)
      .select('usage_tracking.*', 'service_catalog.service_name', 'service_catalog.default_rate', 'plan_services.custom_rate');

    const usageBasedCharges: IUsageBasedCharge[] = usageRecords.map((record: any):IUsageBasedCharge => ({
      serviceId: record.service_id,
      serviceName: record.service_name,
      quantity: record.quantity,
      rate: Math.ceil(record.custom_rate || record.default_rate),
      total: Math.ceil(record.quantity * (record.custom_rate || record.default_rate)),
      tax_region: record.tax_region || record.company_tax_region,
      type: 'usage',
      tax_amount: 0,
      tax_rate: 0,
      usageId: record.usage_id
    }));

    return usageBasedCharges;
  }

  private async calculateBucketPlanCharges(companyId: string, period: IBillingPeriod, billingPlan: ICompanyBillingPlan): Promise<IBucketCharge[]> {
    await this.initKnex();
    const bucketPlan = await this.knex('bucket_plans')
      .where('plan_id', billingPlan.plan_id)
      .first();

    if (!bucketPlan) return [];

    const bucketUsage = await this.knex('bucket_usage')
      .where({
        bucket_plan_id: bucketPlan.bucket_plan_id,
        company_id: companyId
      })
      .whereBetween('period_start', [period.startDate, period.endDate])
      .first();

    if (!bucketUsage) return [];

    const company = await this.knex('companies')
      .where({ company_id: companyId })
      .first();

    if (!company) return [];

    const service = await this.knex('service_catalog')
      .where('service_id', bucketUsage.service_catalog_id)
      .first();

    const taxRegion = service.tax_region || company.tax_region;
    const taxRate = await getCompanyTaxRate(taxRegion, period.endDate);

    const overageRate = Math.ceil(bucketPlan.overage_rate);
    const total = Math.ceil(bucketUsage.overage_hours * overageRate);
    const taxAmount = Math.ceil((taxRate) * total);

    const charge: IBucketCharge = {
      type: 'bucket',
      service_catalog_id: bucketUsage.service_catalog_id,
      serviceName: service ? service.service_name : 'Bucket Plan Hours',
      rate: overageRate,
      total: total,
      hoursUsed: bucketUsage.hours_used,
      overageHours: bucketUsage.overage_hours,
      overageRate: overageRate,
      tax_rate: taxRate,
      tax_region: taxRegion,
      serviceId: bucketUsage.service_catalog_id,
      tax_amount: taxAmount
    };

    console.log('Calculated bucket charge:', charge);

    return [charge];
  }

  private applyProrationToPlan(charges: IBillingCharge[], billingPeriod: IBillingPeriod, planStartDate: ISO8601String, billingCycle: string): IBillingCharge[] {
    console.log('Billing period start:', billingPeriod.startDate);
    console.log('Billing period end:', billingPeriod.endDate);
    console.log('Plan start date:', planStartDate);

    // Use the later of plan start and period start
    const effectiveStart = [planStartDate, billingPeriod.startDate].reduce((a, b) => a > b ? a : b);
    console.log('Effective start:', effectiveStart);

    let cycleLength: number;
    switch (billingCycle) {
      case 'weekly':
        cycleLength = 7;
        break;
      case 'bi-weekly':
        cycleLength = 14;
        break;
      case 'monthly': {
          const cd = parseISO(billingPeriod.startDate);
          cycleLength = getDaysInMonth(new Date(cd.getUTCFullYear(), cd.getUTCMonth(), 1));
        }
        break;
      case 'quarterly':
        cycleLength = 91; // Approximation
        break;
      case 'semi-annually':
        cycleLength = 182; // Approximation
        break;
      case 'annually':
        cycleLength = 365; // Approximation
        break;
      default:{
        const cd = parseISO(billingPeriod.startDate);
        cycleLength = getDaysInMonth(new Date(cd.getUTCFullYear(), cd.getUTCMonth(), 1));
      }
    }

    // Calculate the number of days in the billing period for this plan
    console.log('Getting days between dates:');
    console.log('End date:', billingPeriod.endDate);
    console.log('Start date:', effectiveStart);
    const actualDays = differenceInCalendarDays(
      new Date(billingPeriod.endDate), 
      new Date(effectiveStart)
    ); // DAYLIGHT SAVINGS TIME WARNING
    console.log(`Actual days in plan period: ${actualDays}`);
    console.log(`Cycle length: ${cycleLength}`);

    const prorationFactor = actualDays / cycleLength;
    console.log(`Proration factor: ${prorationFactor.toFixed(4)} (${actualDays} / ${cycleLength})`);

    return charges.map((charge):IBillingCharge => {
      const proratedTotal = Math.ceil(Math.ceil(charge.total) * prorationFactor);
      console.log(`Prorating charge: ${charge.serviceName}`);
      console.log(`  Original total: $${(charge.total/100).toFixed(2)}`);
      console.log(`  Prorated total: $${(proratedTotal/100).toFixed(2)}`);
      return {
        ...charge,
        total: proratedTotal
      };
    });
  }

  private async applyDiscountsAndAdjustments(
    billingResult: IBillingResult,
    companyId: string,
    billingPeriod: IBillingPeriod
  ): Promise<IBillingResult> {
    // Fetch applicable discounts within the billing period
    const discounts = await this.fetchDiscounts(companyId, billingPeriod);

    let discountTotal = 0;
    for (const discount of discounts) {
      if (discount.discount_type === 'percentage') {
        discount.amount = (billingResult.totalAmount * (discount.value));
      } else if (discount.discount_type === 'fixed') {
        discount.amount = discount.value;
      }
      discountTotal += discount.amount || 0;
    }

    const finalAmount = billingResult.totalAmount - discountTotal;

    return {
      ...billingResult,
      discounts,
      adjustments: [], // Implement adjustments if needed
      finalAmount
    };
  }

  private async fetchDiscounts(companyId: string, billingPeriod: IBillingPeriod): Promise<IDiscount[]> {
    await this.initKnex();
    const { startDate, endDate } = billingPeriod;
    const discounts = await this.knex('discounts')
      .join('plan_discounts', 'discounts.discount_id', 'plan_discounts.discount_id')
      .join('company_billing_plans', function (this: Knex.JoinClause) {
        this.on('company_billing_plans.plan_id', '=', 'plan_discounts.plan_id')
          .andOn('company_billing_plans.company_id', '=', 'plan_discounts.company_id');
      })
      .where('company_billing_plans.company_id', companyId)
      .andWhere('discounts.is_active', true)
      .andWhere('discounts.start_date', '<=', endDate)
      .andWhere(function (this: Knex.QueryBuilder) {
        this.whereNull('discounts.end_date')
          .orWhere('discounts.end_date', '>', startDate);
      })
      .select('discounts.*');

    return discounts;
  }

  private async fetchAdjustments(companyId: string): Promise<IAdjustment[]> {
    await this.initKnex();
    const adjustments = await this.knex('adjustments').where({ company_id: companyId });
    return Array.isArray(adjustments) ? adjustments : [];
  }

  async rolloverUnapprovedTime(companyId: string, currentPeriodEnd: ISO8601String, nextPeriodStart: ISO8601String): Promise<void> {
    await this.initKnex();
    // Fetch unapproved time entries
    const knex = this.knex;
    const unapprovedEntries = await this.knex('time_entries')
      .leftJoin('tickets', function (this: Knex.JoinClause) {
        this.on('time_entries.work_item_id', '=', 'tickets.ticket_id')
          .andOn('time_entries.work_item_type', '=', knex.raw('?', ['ticket']))
      })
      .leftJoin('project_tasks', function (this: Knex.JoinClause) {
        this.on('time_entries.work_item_id', '=', 'project_tasks.task_id')
          .andOn('time_entries.work_item_type', '=', knex.raw('?', ['project_task']))
      })
      .leftJoin('project_phases', 'project_tasks.phase_id', 'project_phases.phase_id')
      .leftJoin('projects', 'project_phases.project_id', 'projects.project_id')
      .where(function (this: Knex.QueryBuilder) {
        this.where('tickets.company_id', companyId)
          .orWhere('projects.company_id', companyId)
      })
      .whereIn('time_entries.approval_status', ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED'])
      .where('time_entries.end_time', '<=', currentPeriodEnd)
      .select('time_entries.*');

    // Update the start and end times of unapproved entries to the next billing period
    for (const entry of unapprovedEntries) {
      const duration = differenceInMilliseconds(entry.end_time, entry.start_time);
      const newStartTime = parseISO(nextPeriodStart);
      const newEndTime = addMilliseconds(newStartTime, duration);
      await this.knex('time_entries')
        .where({ entry_id: entry.entry_id })
        .update({
          start_time: format(newStartTime, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
          end_time: format(newEndTime, "yyyy-MM-dd'T'HH:mm:ss'Z'")
        });
    }

    console.log(`Rolled over ${unapprovedEntries.length} unapproved time entries for company ${companyId}`);
  }

  /**
   * Recalculates an entire invoice, including tax amounts and totals.
   * This is used when updating manual items to ensure all calculations are consistent.
   */
  async recalculateInvoice(invoiceId: string): Promise<void> {
    await this.initKnex();
    console.log(`Recalculating invoice ${invoiceId}`);

    // Load invoice and company details
    const invoice = await this.knex('invoices')
      .where({ invoice_id: invoiceId })
      .first();

    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }

    const company = await this.knex('companies')
      .where({ company_id: invoice.company_id })
      .first();

    if (!company) {
      throw new Error(`Company ${invoice.company_id} not found`);
    }

    const taxService = new TaxService();
    let subtotal = 0;
    let totalTax = 0;

    // Process each line item
    const items = await this.knex('invoice_items')
      .where({ invoice_id: invoiceId })
      .orderBy('created_at', 'asc');

    console.log(`Processing ${items.length} invoice items`);

    console.log('Starting invoice recalculation:', {
      invoiceId,
      itemCount: items.length,
      company: {
        id: company.company_id,
        name: company.company_name,
        isTaxExempt: company.is_tax_exempt,
        taxRegion: company.tax_region
      }
    });

    await this.knex.transaction(async (trx) => {
      // First process non-discount items
      const regularItems = items.filter(item => !item.is_discount);
      for (const item of regularItems) {
        // Get service details for tax info
        const service = await trx('service_catalog')
          .where({ service_id: item.service_id })
          .first();

        // Ensure netAmount is an integer
        const netAmount = typeof item.net_amount === 'string' ? parseInt(item.net_amount, 10) : item.net_amount;
        let taxAmount = 0;
        let taxRate = 0;

        console.log('Processing regular item:', {
          itemId: item.item_id,
          serviceId: item.service_id,
          serviceName: service?.service_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          netAmount,
          isTaxable: service ? service.is_taxable !== false : true,
          taxRegion: service?.tax_region || company.tax_region
        });

        // Only calculate tax for taxable items and non-exempt companies
        if (!company.is_tax_exempt && (!service || service.is_taxable !== false)) {
          const taxCalculationResult = await taxService.calculateTax(
            company.company_id,
            netAmount,
            new Date().toISOString()
          );
          taxAmount = Math.round(taxCalculationResult.taxAmount);
          taxRate = taxCalculationResult.taxRate;
        }

        const totalPrice = netAmount + taxAmount;

        // Update item with new tax calculation
        await trx('invoice_items')
          .where({ item_id: item.item_id })
          .update({
            tax_amount: taxAmount,
            tax_rate: taxRate,
            tax_region: service?.tax_region || company.tax_region,
            total_price: totalPrice
          });

        subtotal = Math.round(subtotal + netAmount);
        totalTax = Math.round(totalTax + taxAmount);
      }

      // Then process discount items (which should already have negative amounts)
      const discountItems = items.filter(item => item.is_discount);
      for (const item of discountItems) {
        console.log('item:', item);
        let netAmount: number;
        // Ensure netAmount is an integer and is negative
        netAmount = typeof item.net_amount === 'string' ?
          -Math.abs(parseInt(item.net_amount, 10)) :
          -Math.abs(item.net_amount);

        console.log('Processing discount item:', {
          itemId: item.item_id,
          discountType: item.discount_type,
          netAmount,
          appliesTo: item.applies_to_item_id || 'entire invoice'
        });

        // No tax calculation needed for discounts
        const taxAmount = 0;
        const taxRate = 0;

        if (item.discount_type === 'percentage') {
          // For percentage discounts, calculate based on applicable amount and stored percentage
          const applicableAmount = item.applies_to_item_id
            ? (await trx('invoice_items')
                .where({ item_id: item.applies_to_item_id })
                .first())?.net_amount || 0
            : subtotal;
          
          // Use discount_percentage field instead of rate for percentage calculation
          const percentage = item.discount_percentage || 0;
          netAmount = -Math.round((applicableAmount * percentage) / 100);

          console.log('Processing percentage discount:', {
            itemId: item.item_id,
            percentage,
            applicableAmount,
            calculatedDiscount: netAmount,
            appliesTo: item.applies_to_item_id || 'entire invoice'
          });

          // Update discount item, preserving the original percentage
          await trx('invoice_items')
            .where({ item_id: item.item_id })
            .update({
              net_amount: netAmount,
              tax_amount: 0,
              tax_rate: 0,
              total_price: netAmount,
              unit_price: netAmount, // Store calculated amount in unit_price
              discount_percentage: percentage // Preserve the original percentage
            });
        } else {
          // Fixed amount discounts
          netAmount = Math.round(item.net_amount);

          console.log('Processing fixed discount:', {
            itemId: item.item_id,
            fixedAmount: netAmount,
            appliesTo: item.applies_to_item_id || 'entire invoice'
          });

          // Update fixed discount item
          await trx('invoice_items')
            .where({ item_id: item.item_id })
            .update({
              net_amount: netAmount,
              tax_amount: 0,
              tax_rate: 0,
              total_price: netAmount,
              unit_price: netAmount,
              discount_percentage: null // Clear any percentage for fixed discounts
            });
        }

        subtotal = Math.round(subtotal + netAmount);
      }

      // Calculate final totals using Math.round for consistent rounding
      const finalSubtotal = Math.round(subtotal);
      const finalTax = Math.round(totalTax);
      const finalTotal = Math.round(finalSubtotal + finalTax);

      console.log('Final totals:', {
        finalSubtotal,
        finalTax,
        finalTotal,
        originalSubtotal: subtotal,
        originalTax: totalTax,
        originalTotal: subtotal + totalTax
      });

      // Update invoice totals
      await trx('invoices')
        .where({ invoice_id: invoiceId })
        .update({
          subtotal: finalSubtotal,
          tax: finalTax,
          total_amount: finalTotal
        });

      // Record adjustment transaction
      await trx('transactions').insert({
        transaction_id: uuidv4(),
        tenant: invoice.tenant,
        company_id: invoice.company_id,
        invoice_id: invoiceId,
        amount: finalTotal,
        type: 'invoice_adjustment',
        status: 'completed',
        description: `Recalculated invoice ${invoice.invoice_number}`,
        created_at: new Date().toISOString(),
        balance_after: finalTotal
      });
    });

    console.log(`Invoice ${invoiceId} recalculated:`, {
      subtotal: subtotal,
      tax: totalTax,
      total: subtotal + totalTax
    });
  }
}
